import { useRef, useEffect, type CSSProperties } from 'react';
import { ClientRuntime, RendererType, type IRuntimeClientApplication } from '@primitiv/client';
import './PrimitivClient.css';

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
  className = '',
  style,
  autoplay = true,
  onRuntime,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const depsKey = `${url}-${renderer}-${width}-${height}-${autoplay}`;

  useEffect(() => {
    if (!containerRef.current) return;

    if (initializedWithKeyRef.current === depsKey) {
      return;
    }

    if (runtimeRef.current) {
      runtimeRef.current.stop();
      runtimeRef.current = null;
    }

    containerRef.current.innerHTML = '';
    initializedWithKeyRef.current = depsKey;

    const runtime = new ClientRuntime({
      mode: 'webrtc-lite',
      webrtcLite: {
        url,
      },
      application,
      displays: [{ displayId: 0, container: containerRef.current!, renderer }],
      autoplay,
    });

    runtimeRef.current = runtime;
    onRuntime?.(runtime);

    return () => {
      if (runtimeRef.current) {
        runtimeRef.current.stop();
        runtimeRef.current = null;
        onRuntime?.(null);
      }
      initializedWithKeyRef.current = null;
    };
  }, [url, application, renderer, width, height, autoplay, depsKey]);

  return <div ref={containerRef} className={`primitiv-client ${className}`} style={style} />;
};

export default PrimitivClient;
