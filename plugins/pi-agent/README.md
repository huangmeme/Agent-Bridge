# Pi Agent Plugin

Committed Pi agent plugin source for Agent Bridge lives here.

## Entry Point

- `plugins/pi-agent/extensions/agent-bridge.js`

## Local Pi Agent Loading

Keep your machine-specific Pi extension loader outside version control.

For a project-local loader, create `.pi/extensions/agent-bridge.ts` and point it at this committed file:

```ts
export { default } from "../../plugins/pi-agent/extensions/agent-bridge.js";
```

Pi also supports global loading from `~/.pi/agent/extensions/`.

## What It Does

- Reads `~/.agent-bridge/active-sessions.json`
- Matches the best VS Code bridge session for the current Pi working directory
- Calls the local bridge HTTP API for `/v1/health` and `/v1/context/active-editor`
- Appends the current editor metadata, primary selection, and diagnostics to Pi's per-turn system prompt

## Optional environment variables

- `AGENT_BRIDGE_HOME`
  - Override the default bridge home directory. Defaults to `~/.agent-bridge`.
- `AGENT_BRIDGE_DIAGNOSTIC_LIMIT`
  - Maximum diagnostics included in summaries. Defaults to `8`.
