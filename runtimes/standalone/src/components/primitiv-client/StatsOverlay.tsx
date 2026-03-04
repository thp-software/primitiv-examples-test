import React, { useEffect, useState, useRef, useMemo, memo } from "react";
import type { ClientRuntime } from "@primitiv/client";

// =============================================================================
// Types
// =============================================================================

interface StatsSnapshot {
  // Performance
  cappedFps: number;
  avgUpdateMs: number;
  avgRenderMs: number;
  uncappedFps: number;
  // Network
  bps: number;
  total: number;
}

interface StatsOverlayProps {
  runtime: ClientRuntime | null;
}

// =============================================================================
// Helpers
// =============================================================================

function getTotalBytes(runtime: ClientRuntime): {
  total: number;
  latencyMs: number;
} {
  let total = 0;

  const layerStats = runtime.getLayerTrafficStats?.();
  if (layerStats) {
    for (const key in layerStats) {
      total += layerStats[key as unknown as number].total;
    }
  }

  const miscStats = runtime.getMiscTrafficStats?.();
  if (miscStats) {
    for (const key in miscStats) {
      total += miscStats[key].total;
    }
  }

  const clientStats = runtime.getStats?.();
  const latencyMs = clientStats?.latencyMs ?? 0;

  return { total, latencyMs };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatBps(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

// =============================================================================
// Inner component
// =============================================================================

const RAF_SAMPLE_COUNT = 60;

const StatsOverlayInner: React.FC<StatsOverlayProps> = ({ runtime }) => {
  const [snap, setSnap] = useState<StatsSnapshot>({
    cappedFps: 0,
    avgUpdateMs: 0,
    avgRenderMs: 0,
    uncappedFps: 0,
    bps: 0,
    total: 0,
  });

  const prevRef = useRef<{ total: number; time: number } | null>(null);
  const rafTimesRef = useRef<number[]>([]);
  const lastRafRef = useRef(0);
  const rafIdRef = useRef(0);
  const cappedFpsRef = useRef(0);

  // ── rAF loop: measure real capped FPS ──────────────────────────────
  useEffect(() => {
    if (!runtime) return;

    let mounted = true;
    lastRafRef.current = performance.now();
    rafTimesRef.current = [];

    const tick = () => {
      if (!mounted) return;
      const now = performance.now();
      const delta = now - lastRafRef.current;
      lastRafRef.current = now;

      const times = rafTimesRef.current;
      times.push(delta);
      if (times.length > RAF_SAMPLE_COUNT) times.shift();

      const avg = times.reduce((s, t) => s + t, 0) / times.length;
      cappedFpsRef.current = avg > 0 ? 1000 / avg : 0;

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafIdRef.current);
      rafTimesRef.current = [];
    };
  }, [runtime]);

  // ── Interval: poll engine + network stats ───────────────────────────
  useEffect(() => {
    if (!runtime) {
      prevRef.current = null;
      return;
    }

    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const update = () => {
      if (!mounted) return;

      const now = performance.now();

      // ── Network stats ────────────────────────────────────────────────
      const { total } = getTotalBytes(runtime);

      let bps = 0;
      if (prevRef.current !== null) {
        const deltaBytes = total - prevRef.current.total;
        const deltaSec = (now - prevRef.current.time) / 1000;
        if (deltaSec > 0) {
          bps = Math.max(0, deltaBytes / deltaSec);
        }
      }
      prevRef.current = { total, time: now };

      // ── Performance stats (from engine) ──────────────────────────────
      const perf = runtime.getPerformanceStats?.();
      const avgUpdateMs = perf?.avgUpdateMs ?? 0;
      const avgRenderMs = perf?.avgRenderMs ?? 0;

      // Uncapped FPS = 1000 / (update + render time)
      const workMs = avgUpdateMs + avgRenderMs;
      const uncappedFps = workMs > 0 ? 1000 / workMs : 0;

      // Capped FPS from rAF measurement
      const cappedFps = cappedFpsRef.current;

      if (mounted) {
        setSnap({ cappedFps, avgUpdateMs, avgRenderMs, uncappedFps, bps, total });
      }
    };

    const timeoutId = setTimeout(() => {
      if (mounted) {
        update();
        intervalId = setInterval(update, 250);
      }
    }, 50);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
      prevRef.current = null;
    };
  }, [runtime]);

  // ── Color coding ───────────────────────────────────────────────────────
  const cappedFpsColor =
    snap.cappedFps >= 55 ? "#4ade80" : snap.cappedFps >= 30 ? "#facc15" : "#f87171";

  const uncappedColor =
    snap.uncappedFps >= 500
      ? "#4ade80"
      : snap.uncappedFps >= 120
        ? "#38bdf8"
        : snap.uncappedFps >= 60
          ? "#facc15"
          : "#f87171";

  const bpsColorCategory =
    snap.bps < 50 * 1024 ? 0 : snap.bps < 200 * 1024 ? 1 : 2;

  const styles = useMemo(() => {
    const bpsColor =
      bpsColorCategory === 0
        ? "#4ade80"
        : bpsColorCategory === 1
          ? "#facc15"
          : "#f87171";

    return {
      container: {
        position: "absolute" as const,
        top: 6,
        right: 6,
        background: "rgba(0,0,0,0.75)",
        color: "#e5e5e5",
        fontFamily: "monospace",
        fontSize: 11,
        padding: "4px 8px",
        borderRadius: 4,
        pointerEvents: "none" as const,
        zIndex: 9999,
        lineHeight: 1.4,
        userSelect: "none" as const,
      },
      bpsValue: { color: bpsColor, fontWeight: 600 },
      separator: {
        borderTop: "1px solid rgba(255,255,255,0.15)",
        margin: "3px 0",
      },
      dimRow: { opacity: 0.7 } as const,
      label: { opacity: 0.5 } as const,
    };
  }, [bpsColorCategory]);

  return (
    <div style={styles.container}>
      {/* Performance section */}
      <div>
        <span style={{ color: cappedFpsColor, fontWeight: 600 }}>
          {snap.cappedFps.toFixed(0)} FPS
        </span>
      </div>
      <div style={styles.dimRow}>
        <span style={styles.label}>update </span>
        {snap.avgUpdateMs.toFixed(2)} ms
      </div>
      <div style={styles.dimRow}>
        <span style={styles.label}>render </span>
        {snap.avgRenderMs.toFixed(2)} ms
      </div>
      <div>
        <span style={styles.label}>max </span>
        <span style={{ color: uncappedColor, fontWeight: 600 }}>
          {snap.uncappedFps.toFixed(0)} FPS
        </span>
      </div>

      {/* Separator */}
      <div style={styles.separator} />

      {/* Network section */}
      <div>
        <span style={styles.bpsValue}>{formatBps(snap.bps)}</span>
      </div>
      <div style={styles.dimRow}>total: {formatBytes(snap.total)}</div>
    </div>
  );
};

// =============================================================================
// Exported memoized wrapper
// =============================================================================

export const StatsOverlay = memo(StatsOverlayInner);
