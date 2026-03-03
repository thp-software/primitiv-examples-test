import { useRef, useEffect, useState, type CSSProperties } from "react";
import {
  ClientRuntime,
  RendererType,
  type IApplication,
} from "@primitiv/client";
import "./PrimitivClient.css";
import { BandwidthOverlay } from "./BandwidthOverlay";

// =============================================================================
// Types
// =============================================================================

interface PrimitivClientBridgeProps {
  /** The Primitiv Application instance to run */
  application: IApplication;
  /** Renderer type (default: TerminalGL) */
  renderer?: RendererType;
  /** Grid width in cells (default: 80) */
  width?: number;
  /** Grid height in cells (default: 24) */
  height?: number;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
  /** Whether to enable autoplay (default: true) */
  autoplay?: boolean;
  /** Callback for bridge messages from the engine */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBridgeMessage?: (channel: string, data: any) => void;
  /** Callback when the runtime is initialized */
  onRuntimeReady?: (runtime: ClientRuntime) => void;
}

// =============================================================================
// Component
// =============================================================================

/**
 * PrimitivClientBridge — React wrapper with bridge communication support.
 *
 * Single display, plus `onBridgeMessage` and `onRuntimeReady` callbacks
 * for host ↔ engine communication via the bridge system.
 *
 * Handles:
 * - Initialization and cleanup of the ClientRuntime
 * - Protection against React Strict Mode double-invocation
 * - Hot Module Replacement (HMR) support for development
 * - Stable callback refs to avoid unnecessary re-initialization
 */
const PrimitivClientBridge: React.FC<PrimitivClientBridgeProps> = ({
  application,
  renderer = RendererType.TerminalGL,
  width = 80,
  height = 24,
  className = "",
  style,
  autoplay = true,
  onBridgeMessage,
  onRuntimeReady,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const [activeRuntime, setActiveRuntime] = useState<ClientRuntime | null>(
    null,
  );

  // Stable callback refs — avoid re-initialization when handlers change
  const bridgeHandlerRef = useRef(onBridgeMessage);
  const readyHandlerRef = useRef(onRuntimeReady);
  useEffect(() => {
    bridgeHandlerRef.current = onBridgeMessage;
  }, [onBridgeMessage]);
  useEffect(() => {
    readyHandlerRef.current = onRuntimeReady;
  }, [onRuntimeReady]);

  const depsKey = `${application.constructor.name}-${renderer}-${width}-${height}-${autoplay}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Strict Mode protection
    if (initializedWithKeyRef.current === depsKey) return;

    // HMR cleanup
    if (runtimeRef.current) {
      runtimeRef.current.destroy();
      runtimeRef.current = null;
    }
    container.innerHTML = "";
    initializedWithKeyRef.current = depsKey;

    // Initialize
    const runtime = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: [{ displayId: 0, container, renderer }],
      autoplay,
      debug: true,
      logLevel: "warn",
    });

    // Attach bridge handler via stable ref
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.onBridgeMessage = (msg: any) => {
      bridgeHandlerRef.current?.(msg.channel, msg.data);
    };

    runtimeRef.current = runtime;
    setActiveRuntime(runtime);
    readyHandlerRef.current?.(runtime);

    return () => {
      const rt = runtimeRef.current;
      runtimeRef.current = null;
      setActiveRuntime(null);
      if (rt) {
        rt.destroy();
      }
      // Clear the container to release any DOM/WebGL resources
      if (container) {
        container.innerHTML = "";
      }
      initializedWithKeyRef.current = null;
    };
  }, [application, renderer, width, height, autoplay, depsKey]);

  return (
    <div
      className={`primitiv-client ${className}`}
      style={{ display: "flex", ...style }}
    >
      <div ref={containerRef} style={{ flex: 1 }} />
      <BandwidthOverlay runtime={activeRuntime} />
    </div>
  );
};

export default PrimitivClientBridge;
