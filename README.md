# Primitiv Examples

Welcome to the central repository for Primitiv Engine applications and runtimes.

This directory is structured into two main parts:
- `/applications`: Contains pure, isomorphic Primitiv application logic (agnostic to any specific client or server).
- `/runtimes`: Contains the actual execution environments (Standalone, uWebSockets, WebRTC, etc.) that run the applications.

## Global Commands

To make development easier, a root `package.json` provides global commands to manage all runtimes simultaneously from this folder.

### Refresh & Link (Monorepo specific)
If you are modifying the core `@primitiv/engine` codebase alongside this repository, use these commands to synchronize the local builds across all runtimes:
- `npm run primitiv:refresh` : Cleans everything, rebuilds, and relinks local Primitiv dependencies across **all** runtimes.
- `npm run primitiv:link` : Links your local Primitiv packages to all runtimes.
- `npm run primitiv:unlink` : Reverts all runtimes to use the NPM registry versions.

### Running the Examples
You can launch any specific runtime directly from this root folder.

**Standalone Mode**
- `npm run dev:standalone`
  *Launches the Standalone (Client-only) preview.*

**Connected Modes (Multiplayer / Server-Authoritative)**
These commands automatically launch **both** the Server and the Client concurrently.
- `npm run dev:uws`
  *Launches the high-performance uWebSockets network runtime.*
- `npm run dev:webrtc-lite`
  *Launches the lightweight WebRTC network runtime.*
- `npm run dev:webrtc-full`
  *Launches the full Node-WebRTC network runtime.*