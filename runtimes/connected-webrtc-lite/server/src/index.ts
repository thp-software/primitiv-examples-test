import { RuntimeServer } from '@primitiv/server';
import { MultiUserShowcase } from '../../../../applications/15-multi-user/index.js';

const server = new RuntimeServer({
  transport: 'webrtc-lite',
  webrtcLite: { port: 3001 },
  debug: true,
  debugUi: true,
  application: new MultiUserShowcase(),
});

server.start().catch((err) => {
  console.error('Failed to start Primitiv server:', err);
});
