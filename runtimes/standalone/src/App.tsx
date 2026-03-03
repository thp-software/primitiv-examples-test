import { useMemo, useState, useCallback, memo } from "react";
import { HashRouter, Routes, Route, Link, useParams } from "react-router-dom";
import {
  PrimitivClient,
  PrimitivClientBridge,
  PrimitivClientMultiDisplay,
} from "./components/primitiv-client";
import { RendererType } from "@primitiv/client";
import { APP_REGISTRY, findApp } from "./app-registry";
import type { AppEntry } from "./app-registry";

// @ts-ignore
const buildDate =
  typeof __BUILD_DATE__ !== "undefined" ? __BUILD_DATE__ : "Local Dev";

// =============================================================================
// Home Page
// =============================================================================

function HomePage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        backgroundColor: "#0a0a12",
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          padding: "3rem 1rem 1.5rem",
          textAlign: "center",
          maxWidth: "800px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <h1>Primitiv Examples</h1>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
            padding: "0.3rem 1rem",
            borderRadius: "9999px",
            marginTop: "-1rem",
            marginBottom: "2rem",
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#fbbf24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <span
            style={{
              fontSize: "0.85rem",
              color: "#fbbf24",
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            Pre-Alpha: Engine and API are subject to breaking changes.
          </span>
        </div>
        <p>
          <span
            style={{
              fontSize: "0.75rem",
              color: "#475569",
              background: "rgba(255,255,255,0.05)",
              padding: "0.2rem 0.5rem",
              borderRadius: "4px",
              fontFamily: "monospace",
            }}
          >
            Build: {buildDate}
          </span>
        </p>
        <a
          href="https://github.com/thp-software/primitiv-examples"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.85rem",
            color: "#94a3b8",
            textDecoration: "none",
            background: "rgba(255,255,255,0.05)",
            padding: "0.3rem 0.75rem",
            borderRadius: "6px",
            marginLeft: "0.75rem",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#94a3b8";
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Source Code
        </a>
      </div>

      <AppSection
        title="Examples"
        description="Basic tutorials introducing the core concepts and APIs of the engine."
        apps={APP_REGISTRY.filter((a) => !a.category)}
      />

      {/* Visual Separator for Showcases */}
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          padding: "3rem 1rem 1rem",
          boxSizing: "border-box",
          marginTop: "1rem",
          borderTop: "2px dashed rgba(255,255,255,0.1)",
        }}
      >
        <h3
          style={{
            fontSize: "1.2rem",
            color: "#94a3b8",
            marginBottom: "0.5rem",
            fontWeight: 500,
          }}
        >
          Showcases & Tech Demos
        </h3>
        <p
          style={{
            fontSize: "0.9rem",
            color: "#64748b",
            lineHeight: 1.5,
            margin: 0,
            background: "rgba(30, 41, 59, 0.3)",
            padding: "1rem",
            borderRadius: "8px",
            borderLeft: "3px solid #6366f1",
          }}
        >
          <strong>Note:</strong> The following applications are primarily
          rendering-based showcases rather than fully-fledged video games. They
          serve as open-source technical demos and reference implementations for
          advanced Primitiv Engine algorithms.
        </p>
      </div>

      <AppSection
        title="2D Showcases"
        description="2D applications and retro terminal clones."
        apps={APP_REGISTRY.filter((a) => a.category === "showcase")}
      />
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          padding: "0 1rem",
          boxSizing: "border-box",
          marginBottom: "0.5rem",
        }}
      >
        <p
          style={{
            fontSize: "0.85rem",
            color: "#64748b",
            lineHeight: 1.5,
            margin: 0,
            background: "rgba(30, 41, 59, 0.3)",
            padding: "1rem",
            borderRadius: "8px",
            borderLeft: "3px solid #f59e0b",
          }}
        >
          <strong style={{ color: "#fbbf24" }}>⚠ Bandwidth note:</strong> 3D
          showcases rely heavily on full-frame rendering: every tick pushes a
          complete screen diff rather than incremental layer updates. This makes
          them significantly more network-intensive than other showcases. Since
          this runtime runs in <strong>standalone mode</strong>, all traffic is{" "}
          <strong>loopback</strong> (in-process), so no real network is
          involved, but the bandwidth counter will still show high values
          reflecting the volume of data processed internally.
        </p>
      </div>
      <AppSection
        title="3D Showcases"
        description="Pseudo-3D renders and raycasting experiments."
        apps={APP_REGISTRY.filter((a) => a.category === "showcase-3d")}
      />
    </div>
  );
}

function AppSection({
  title,
  description,
  apps,
}: {
  title: string;
  description?: string;
  apps: AppEntry[];
}) {
  if (apps.length === 0) return null;
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "900px",
        padding: "0 1rem",
        boxSizing: "border-box",
      }}
    >
      <h2
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#475569",
          margin: "2rem 0 0.75rem",
          paddingBottom: "0.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            fontSize: "0.85rem",
            color: "#64748b",
            marginTop: "-0.5rem",
            marginBottom: "1rem",
            lineHeight: 1.4,
          }}
        >
          {description}
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: "1rem",
          paddingBottom: "2rem",
        }}
      >
        {apps.map((app) => (
          <AppCard key={app.slug} app={app} />
        ))}
      </div>
    </div>
  );
}

function AppCard({ app }: { app: AppEntry }) {
  const firstPart = app.slug.split("-")[0];
  const num = /^\d+$/.test(firstPart) ? firstPart : null;
  return (
    <Link
      to={`/${app.slug}`}
      style={{
        display: "block",
        textDecoration: "none",
        background: "rgba(30, 41, 59, 0.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "12px",
        padding: "1.25rem 1.5rem",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.5rem",
          marginBottom: "0.4rem",
        }}
      >
        {num ? (
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#6366f1",
              fontFamily: "monospace",
            }}
          >
            {num}
          </span>
        ) : null}
        <span
          style={{
            fontSize: "1.05rem",
            fontWeight: 600,
            color: "#e2e8f0",
          }}
        >
          {app.name.replace(/^\d+\s+/, "")}
        </span>
      </div>
      <p
        style={{
          fontSize: "0.85rem",
          color: "#94a3b8",
          margin: 0,
          lineHeight: 1.4,
        }}
      >
        {app.description}
      </p>
    </Link>
  );
}

// =============================================================================
// App Runner
// =============================================================================

const THEME_NAMES = ["CYBER", "FOREST", "SUNSET", "OCEAN"];
const THEME_COLORS = ["#6366f1", "#22c55e", "#f97316", "#0ea5e9"];

/**
 * Isolated memo component for theme buttons.
 * Does NOT receive `messages` as a prop, so it never re-renders from heartbeats.
 * Only re-renders when the user actually clicks a different theme.
 */
const ThemeButtons = memo(function ThemeButtons({
  activeTheme,
  onSwitch,
}: {
  activeTheme: number;
  onSwitch: (i: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 500 }}>
        THEME (bridge → palette switch)
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.5rem",
        }}
      >
        {THEME_NAMES.map((name, i) => (
          <button
            key={name}
            onClick={() => onSwitch(i)}
            style={{
              padding: "0.6rem",
              backgroundColor: activeTheme === i ? THEME_COLORS[i] : "#1e293b",
              border: `2px solid ${
                activeTheme === i ? THEME_COLORS[i] : "#334155"
              }`,
              borderRadius: "8px",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
});

function BridgeDemoOverlay({
  runtime,
  messages,
  activeTheme,
  onThemeChange,
}: {
  runtime: any;
  messages: any[];
  activeTheme: number;
  onThemeChange: (index: number) => void;
}) {
  const lastFromEngine = messages.find(
    (m) => m.channel === "message-from-engine",
  );
  const lastHeartbeat = messages.find((m) => m.channel === "engine-heartbeat");
  const [reactSentCount, setReactSentCount] = useState(0);

  const sendMessage = useCallback(() => {
    const nextCount = reactSentCount + 1;
    setReactSentCount(nextCount);
    const payload = {
      text: `React Hello #${nextCount} (${new Date().toLocaleTimeString()})`,
    };
    runtime?.sendBridge("message-to-engine", payload);
    const engine = runtime?.getEngine?.();
    if (engine && engine.sessions) {
      for (const user of engine.sessions.values()) {
        user.bridgeInbox.push({
          channel: "message-to-engine",
          data: payload,
          type: "json",
        });
      }
    }
  }, [runtime, reactSentCount]);

  const switchTheme = useCallback(
    (index: number) => {
      onThemeChange(index);
      const payload = { themeIndex: index };
      runtime?.sendBridge("set-theme", payload);
      const engine = runtime?.getEngine?.();
      if (engine && engine.sessions) {
        for (const user of engine.sessions.values()) {
          user.bridgeInbox.push({
            channel: "set-theme",
            data: payload,
            type: "json",
          });
        }
      }
    },
    [runtime, onThemeChange],
  );

  return (
    <div
      style={{
        width: "320px",
        height: "100%",
        background: "#0f172a",
        borderLeft: "1px solid #1e293b",
        padding: "1.5rem",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        flexShrink: 0,
        overflowY: "auto",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "1.25rem",
          color: "#6366f1",
          fontWeight: 700,
        }}
      >
        React Host Panel
      </h3>

      <ThemeButtons activeTheme={activeTheme} onSwitch={switchTheme} />

      {/* Commands */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 500 }}>
          COMMANDS
        </div>
        <button
          onClick={sendMessage}
          style={{
            width: "100%",
            padding: "0.75rem",
            backgroundColor: "#6366f1",
            border: "none",
            borderRadius: "8px",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Send Message to Engine
        </button>
      </div>

      {/* Heartbeat Telemetry (from broadcastBridge) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 500 }}>
          ENGINE STATS (broadcastBridge)
        </div>
        <div
          style={{
            padding: "0.85rem",
            background: "#020617",
            borderRadius: "12px",
            fontSize: "0.8rem",
            border: "1px solid #1e293b",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {lastHeartbeat ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Seq</span>
                <span style={{ color: "#10b981", fontWeight: 700 }}>
                  #{lastHeartbeat.data.seq}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Uptime</span>
                <span style={{ color: "#f8fafc" }}>
                  {lastHeartbeat.data.uptimeSeconds}s
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Tick</span>
                <span style={{ color: "#f8fafc" }}>
                  {lastHeartbeat.data.tickCount}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Clients</span>
                <span style={{ color: "#f8fafc" }}>
                  {lastHeartbeat.data.connectedClients}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: "#475569", textAlign: "center" }}>
              Waiting for heartbeat...
            </div>
          )}
        </div>
      </div>

      {/* Last Engine Message (from sendBridge) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 500 }}>
          LAST FROM ENGINE (sendBridge)
        </div>
        <div
          style={{
            padding: "0.85rem",
            background: "#020617",
            borderRadius: "12px",
            fontSize: "0.85rem",
            border: "1px solid #1e293b",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {lastFromEngine ? (
            <div>
              <div
                style={{
                  color: "#10b981",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                  fontSize: "0.75rem",
                }}
              >
                PING #{lastFromEngine.data.count}
              </div>
              <div style={{ color: "#f8fafc", lineHeight: 1.5 }}>
                "{lastFromEngine.data.text}"
              </div>
            </div>
          ) : (
            <div
              style={{
                color: "#475569",
                textAlign: "center",
                fontSize: "0.8rem",
              }}
            >
              Press [SPACE] in the engine...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Controls Overlay
// =============================================================================

function ControlsOverlay({ controls }: { controls: string }) {
  const [open, setOpen] = useState(true);
  const lines = controls.split("\n");

  return (
    <div
      style={{
        position: "absolute",
        bottom: "1rem",
        left: "1rem",
        zIndex: 100,
        pointerEvents: "auto",
      }}
    >
      {open ? (
        <div
          style={{
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
            minWidth: "180px",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              Controls
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                cursor: "pointer",
                padding: "0 0.25rem",
                fontSize: "1rem",
                lineHeight: 1,
              }}
              title="Hide controls"
            >
              ×
            </button>
          </div>
          {lines.map((line, i) => {
            const colonIdx = line.indexOf(":");
            const key = colonIdx > -1 ? line.slice(0, colonIdx) : line;
            const action = colonIdx > -1 ? line.slice(colonIdx + 1).trim() : "";
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.15rem 0",
                  fontSize: "0.8rem",
                  lineHeight: 1.4,
                }}
              >
                <span
                  style={{
                    color: "#e2e8f0",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {key}
                </span>
                {action && <span style={{ color: "#94a3b8" }}>{action}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "0.4rem 0.7rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            backdropFilter: "blur(8px)",
          }}
          title="Show controls"
        >
          ? Controls
        </button>
      )}
    </div>
  );
}

function AppRunner() {
  const { slug } = useParams<{ slug: string }>();
  const entry = slug ? findApp(slug) : undefined;

  if (!entry) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a12",
          color: "#e2e8f0",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2>Example not found: {slug}</h2>
        <Link to="/" style={{ color: "#6366f1" }}>
          ← Back to examples
        </Link>
      </div>
    );
  }

  return <AppRunnerInner entry={entry} />;
}

function AppRunnerInner({ entry }: { entry: AppEntry }) {
  const application = useMemo(() => entry.factory(), [entry]);
  const [runtime, setRuntime] = useState<any>(null);
  const [bridgeMessages, setBridgeMessages] = useState<any[]>([]);

  const isBridgeDemo = entry.slug === "12-bridge-communication";
  const isMultiDisplay = entry.slug === "13-multi-display";

  // Applications requiring user interaction before running (for AudioContext or Navigator.vibrate to work)
  const requiresInteraction = [
    "08-gamepad-input",
    "09-mobile-input",
    "10-audio",
    "showcase-07-terminal-bomber",
  ].includes(entry.slug);
  const shouldAutoplay = !requiresInteraction;

  const [activeTheme, setActiveTheme] = useState(0);

  const handleBridgeMessage = useCallback((channel: string, data: any) => {
    setBridgeMessages((prev) =>
      [{ channel, data, time: Date.now() }, ...prev].slice(0, 10),
    );
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.5rem 1rem",
          backgroundColor: "rgba(15,23,42,0.9)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        <Link
          to="/"
          style={{
            color: "#94a3b8",
            textDecoration: "none",
            fontSize: "0.85rem",
            padding: "0.25rem 0.75rem",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.1)",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)";
            e.currentTarget.style.color = "#e2e8f0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            e.currentTarget.style.color = "#94a3b8";
          }}
        >
          ← Back
        </Link>
        <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.9rem" }}>
          {entry.name}
        </span>
        <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
          {entry.description}
        </span>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Client */}
        <div
          style={{
            flex: 1,
            display: "flex",
          }}
        >
          {/* Render the appropriate client variant */}
          {isMultiDisplay ? (
            <PrimitivClientMultiDisplay
              application={application}
              renderer={RendererType.TerminalGL}
              width={120}
              height={67}
              autoplay={shouldAutoplay}
              displayCount={2}
              gap={8}
              style={{ width: "100%", height: "100%" }}
            />
          ) : isBridgeDemo ? (
            <PrimitivClientBridge
              application={application}
              renderer={RendererType.TerminalGL}
              width={120}
              height={67}
              autoplay={shouldAutoplay}
              onRuntimeReady={setRuntime}
              onBridgeMessage={handleBridgeMessage}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <PrimitivClient
              application={application}
              renderer={RendererType.TerminalGL}
              width={120}
              height={67}
              autoplay={shouldAutoplay}
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </div>

        {/* Side Panel for Bridge Demo */}
        {isBridgeDemo && (
          <BridgeDemoOverlay
            runtime={runtime}
            messages={bridgeMessages}
            activeTheme={activeTheme}
            onThemeChange={setActiveTheme}
          />
        )}

        {/* Controls Overlay */}
        {entry.controls && <ControlsOverlay controls={entry.controls} />}
      </div>
    </div>
  );
}

// =============================================================================
// Root
// =============================================================================

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:slug" element={<AppRunner />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
