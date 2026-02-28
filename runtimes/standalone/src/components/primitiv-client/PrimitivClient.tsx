import { useRef, useEffect, type CSSProperties } from "react";
import {
  ClientRuntime,
  RendererType,
  type IApplication,
} from "@primitiv/client";
import "./PrimitivClient.css";

// =============================================================================
// Types
// =============================================================================

interface PrimitivClientProps {
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
}

// =============================================================================
// Component
// =============================================================================

/**
 * PrimitivClient — simplest React wrapper for the Primitiv ClientRuntime.
 *
 * Single display, no bridge callbacks, no multi-display.
 * Use PrimitivClientBridge or PrimitivClientMultiDisplay for those features.
 *
 * Handles:
 * - Initialization and cleanup of the ClientRuntime
 * - Protection against React Strict Mode double-invocation
 * - Hot Module Replacement (HMR) support for development
 */
const PrimitivClient: React.FC<PrimitivClientProps> = ({
  application,
  renderer = RendererType.TerminalGL,
  width = 80,
  height = 24,
  className = "",
  style,
  autoplay = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const depsKey = `${application.constructor.name}-${renderer}-${width}-${height}-${autoplay}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Strict Mode protection
    if (initializedWithKeyRef.current === depsKey) return;

    // HMR cleanup
    if (runtimeRef.current) {
      runtimeRef.current.stop();
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

    runtimeRef.current = runtime;

    return () => {
      if (runtimeRef.current) {
        runtimeRef.current.stop();
        runtimeRef.current = null;
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
    </div>
  );
};

export default PrimitivClient;
