import { useCallback, useRef } from 'react';
import PrimitivClient from './components/primitiv-client/PrimitivClient';
import { ClientRuntime, RendererType } from '@primitiv/client';
import './App.css';

function App() {
  const runtimeRef = useRef<ClientRuntime | null>(null);

  const handleRuntime = useCallback((runtime: ClientRuntime | null) => {
    runtimeRef.current = runtime;
    if (runtime) {
      console.log("[Primitiv] Connected to uWebSockets runtime.");
    }
  }, []);

  return (
    <div className="app-container">
      <PrimitivClient
        className="client-fullscreen"
        url="ws://localhost:3001"
        renderer={RendererType.TerminalGL}
        width={80}
        height={45}
        onRuntime={handleRuntime}
      />
    </div>
  );
}

export default App;
