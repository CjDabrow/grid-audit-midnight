// Shim for `isomorphic-ws`. The Midnight indexer provider does
// `import * as ws from 'isomorphic-ws'` and reads `ws.WebSocket`, but the package's
// browser build only has a default export, which makes Turbopack fail on the missing
// named export. Both browsers and Node 22+ expose a global WebSocket, so we re-export it
// under both names.
const WS = globalThis.WebSocket;
export { WS as WebSocket };
export default WS;
