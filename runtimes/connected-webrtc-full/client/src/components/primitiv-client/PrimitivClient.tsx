import { useRef, useEffect, useState, type CSSProperties } from "react";
import {
  ClientRuntime,
  RendererType,
  type IRuntimeClientApplication,
} from "@primitiv/client";
import "./PrimitivClient.css";
import { BandwidthOverlay } from "./BandwidthOverlay";

// =============================================================================
// Types
// =============================================================================

interface PrimitivClientProps {
  /** The WebSocket URL of the Primitiv server */
  url: string;
  /** The application logic handlers */
  application?: IRuntimeClientApplication;
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
  /** Callback to receive the ClientRuntime instance once created */
  onRuntime?: (runtime: ClientRuntime | null) => void;
}

// =============================================================================
// Component
// =============================================================================

/**
 * PrimitivClient (Connected Mode) - React wrapper for the Primitiv ClientRuntime
 *
 * This component connects to a remote Primitiv server.
 */
const PrimitivClient: React.FC<PrimitivClientProps> = ({
  url,
  application,
  renderer = RendererType.TerminalGL,
  width = 80,
  height = 24,
  className = "",
  style,
  autoplay = true,
  onRuntime,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);
  const [activeRuntime, setActiveRuntime] = useState<ClientRuntime | null>(
    null,
  );

  const depsKey = `${url}-${renderer}-${width}-${height}-${autoplay}`;

  useEffect(() => {
    if (!containerRef.current) return;

    if (initializedWithKeyRef.current === depsKey) {
      return;
    }

    if (runtimeRef.current) {
      runtimeRef.current.destroy();
      runtimeRef.current = null;
    }

    containerRef.current.innerHTML = "";
    initializedWithKeyRef.current = depsKey;

    const runtime = new ClientRuntime({
      mode: "webrtc-full",
      webrtcFull: {
        url,
        stunServers: ["stun:stun.l.google.com:19302"],
      },
      application,
      displays: [{ displayId: 0, container: containerRef.current!, renderer }],
      autoplay,
    });

    runtimeRef.current = runtime;
    setActiveRuntime(runtime);
    onRuntime?.(runtime);

    return () => {
      const rt = runtimeRef.current;
      runtimeRef.current = null;
      setActiveRuntime(null);
      onRuntime?.(null);
      if (rt) {
        rt.destroy();
      }
      initializedWithKeyRef.current = null;
    };
  }, [url, application, renderer, width, height, autoplay, depsKey]);

  return (
    <div
      className={`primitiv-client ${className}`}
      style={{ position: "relative", ...style }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <BandwidthOverlay runtime={activeRuntime} />
    </div>
  );
};

export default PrimitivClient;
