import React, { useEffect, useState, useRef, useMemo, memo } from "react";
import type { ClientRuntime } from "@primitiv/client";

// =============================================================================
// Types
// =============================================================================

interface NetworkSnapshot {
  bps: number;
  total: number;
  latencyMs: number;
}

interface BandwidthOverlayProps {
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
// Inner component (does the actual work)
// =============================================================================

const BandwidthOverlayInner: React.FC<BandwidthOverlayProps> = ({
  runtime,
}) => {
  const [snap, setSnap] = useState<NetworkSnapshot>({
    bps: 0,
    total: 0,
    latencyMs: 0,
  });
  const prevRef = useRef<{ total: number; time: number } | null>(null);

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
      const { total, latencyMs } = getTotalBytes(runtime);

      let bps = 0;
      if (prevRef.current !== null) {
        const deltaBytes = total - prevRef.current.total;
        const deltaSec = (now - prevRef.current.time) / 1000;
        if (deltaSec > 0) {
          bps = Math.max(0, deltaBytes / deltaSec);
        }
      }
      prevRef.current = { total, time: now };

      if (mounted) {
        setSnap((prev) => {
          if (
            prev.bps === bps &&
            prev.total === total &&
            prev.latencyMs === latencyMs
          ) {
            return prev;
          }
          return { bps, total, latencyMs };
        });
      }
    };

    // Delay first update slightly to avoid blocking initial render
    const timeoutId = setTimeout(() => {
      if (mounted) {
        update();
        intervalId = setInterval(update, 250);
      }
    }, 50);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      prevRef.current = null;
    };
  }, [runtime]);

  // Determine color category (0 = green, 1 = yellow, 2 = red)
  const colorCategory =
    snap.bps < 50 * 1024 ? 0 : snap.bps < 200 * 1024 ? 1 : 2;

  // Memoize styles based on color category, not exact bps value
  const styles = useMemo(() => {
    const color =
      colorCategory === 0
        ? "#4ade80"
        : colorCategory === 1
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
      bpsValue: { color, fontWeight: 600 },
    };
  }, [colorCategory]);

  return (
    <div style={styles.container}>
      <div>
        <span style={styles.bpsValue}>{formatBps(snap.bps)}</span>
      </div>
      <div style={{ opacity: 0.7 }}>total: {formatBytes(snap.total)}</div>
      <div style={{ opacity: 0.7 }}>ping: {snap.latencyMs.toFixed(0)} ms</div>
    </div>
  );
};

// =============================================================================
// Exported memoized wrapper
// =============================================================================

export const BandwidthOverlay = memo(BandwidthOverlayInner);
