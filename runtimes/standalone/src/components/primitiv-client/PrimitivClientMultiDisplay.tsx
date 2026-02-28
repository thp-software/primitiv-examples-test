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

interface PrimitivClientMultiDisplayProps {
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
  /**
   * Total number of Display surfaces (must be ≥ 2).
   * The engine application must create matching Display(id, w, h) instances
   * for each displayId from 0 to displayCount-1.
   */
  displayCount: number;
  /**
   * Pixel gap between display containers (default: 8).
   * Creates a visual separation that makes each surface identifiable.
   */
  gap?: number;
}

// =============================================================================
// Component
// =============================================================================

/**
 * PrimitivClientMultiDisplay — React wrapper for multi-display applications.
 *
 * Renders `displayCount` display surfaces in a horizontal flex row, each in
 * its own container div, separated by `gap` pixels. The runtime injects a
 * canvas into every container.
 *
 * Handles:
 * - Initialization and cleanup of the ClientRuntime
 * - Protection against React Strict Mode double-invocation
 * - Hot Module Replacement (HMR) support for development
 */
const PrimitivClientMultiDisplay: React.FC<PrimitivClientMultiDisplayProps> = ({
  application,
  renderer = RendererType.TerminalGL,
  width = 80,
  height = 24,
  className = "",
  style,
  autoplay = true,
  displayCount,
  gap = 8,
}) => {
  // One ref slot per display surface
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const runtimeRef = useRef<ClientRuntime | null>(null);
  const initializedWithKeyRef = useRef<string | null>(null);

  const depsKey = `${application.constructor.name}-${renderer}-${width}-${height}-${autoplay}-${displayCount}`;

  useEffect(() => {
    // Collect all container divs — bail if any aren't mounted yet
    const containers: HTMLDivElement[] = [];
    for (let i = 0; i < displayCount; i++) {
      const c = containerRefs.current[i];
      if (!c) return;
      containers.push(c);
    }

    // Strict Mode protection
    if (initializedWithKeyRef.current === depsKey) return;

    // HMR cleanup
    if (runtimeRef.current) {
      runtimeRef.current.stop();
      runtimeRef.current = null;
    }
    for (const c of containers) c.innerHTML = "";
    initializedWithKeyRef.current = depsKey;

    // Initialize runtime with all display slots
    const runtime = new ClientRuntime({
      mode: "standalone",
      standalone: { application },
      displays: containers.map((container, i) => ({
        displayId: i,
        container,
        renderer,
      })) as [
        {
          displayId: number;
          container: HTMLDivElement;
          renderer: RendererType;
        },
        ...{
          displayId: number;
          container: HTMLDivElement;
          renderer: RendererType;
        }[],
      ],
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
  }, [application, renderer, width, height, autoplay, depsKey, displayCount]);

  return (
    <div
      className={`primitiv-client ${className}`}
      style={{
        display: "flex",
        flexDirection: "row",
        gap: `${gap}px`,
        ...style,
      }}
    >
      {Array.from({ length: displayCount }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            containerRefs.current[i] = el;
          }}
          style={{ flex: 1, position: "relative" }}
        />
      ))}
    </div>
  );
};

export default PrimitivClientMultiDisplay;
