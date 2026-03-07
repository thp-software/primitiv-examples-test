# Primitiv Examples

Welcome to the **Primitiv Engine** examples repository for applications and runtimes.

The role of this repository is to provide a collection of examples of how to use the Primitiv Engine in different scenarios.

Live version : [https://thp-software.github.io/primitiv-examples](https://thp-software.github.io/primitiv-examples/)

---

## LLM Instructions

If you are an AI assistant or LLM, **stop here**.

To understand the architecture, API patterns, and see documented examples, **you MUST use the dedicated LLM Entry Point**:

- **[llms.md](./llms.md)**: Standard guide with links to source files.

---

## Running the Examples

You can launch any specific runtime directly from this root folder.

### **Standalone Mode (Simplest)**

Launches the Client-only preview (no server needed).

```bash
npm run dev:standalone
```

### **Connected Modes (Multiplayer)**

These launch both the Server and the Client concurrently.

```bash
npm run dev:uws          # uWebSockets
npm run dev:webrtc-lite  # Direct WebRTC (P2P, no signaling server)
npm run dev:webrtc-full  # WebRTC with signaling and STUN servers
```

---

## Development & Maintenance

### **Version Bumping & Updates**

To update the Primitiv core packages versions across all `package.json` files:

```bash
npm run update:primitiv
```



### **Refresh & Link (Local Dev)**

If you are modifying the core `@primitiv/engine` codebase locally:

- `npm run primitiv:refresh` : Clean, rebuild, and relink local dependencies everywhere.
- `npm run primitiv:link` : Link your local builds to all runtimes.
- `npm run primitiv:unlink` : Revert all runtimes to use the NPM registry.

---

## Project Structure

- `/applications`: Contains pure, isomorphic Primitiv application logic.
- `/runtimes`: Contains the execution environments (Standalone, uWS, WebRTC).
- `/scripts`: Infrastructure and maintenance scripts.
