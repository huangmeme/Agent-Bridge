# Agent Bridge

Agent Bridge is a VS Code extension that exposes the current editor context to external agents through VS Code itself, instead of asking those agents to talk to language servers directly.

The extension captures what VS Code is actually showing right now:

- active document metadata
- visible ranges
- visible text blocks
- selections and primary selection
- current document diagnostics
- dirty and untitled state

This repository also includes committed agent-side integrations for:

- [OpenCode](plugins/opencode/README.md)
- [Pi agent](plugins/pi-agent/README.md)

## Why

Most external coding agents can inspect files on disk, but that is not the same thing as knowing what the user is actively looking at in the editor.

Agent Bridge gives external tools a VS Code-native snapshot of the current editing surface, including:

- unsaved buffer contents
- the current viewport
- the user's primary cursor or selection
- diagnostics already available inside VS Code

## How It Works

1. The VS Code extension starts a loopback HTTP server on `127.0.0.1`.
2. When the bridge is enabled for the current workspace, it generates a session id and bearer token.
3. It writes session metadata to `~/.agent-bridge/active-sessions.json` and `~/.agent-bridge/sessions/<sessionId>.json`.
4. External agents discover the active session, call the local bridge API, and inject the returned context into their own runtime.

The extension auto-enables on startup when a workspace is open. In the status bar:

- `Bridge` means the bridge is enabled
- `circle-slash + Bridge` means the bridge is disabled

## HTTP API

All endpoints are local-only and served from `127.0.0.1`.

### `GET /v1/health`

Returns bridge status information:

- `status`: `ok` or `disabled`
- `version`
- `sessionId`
- `workspaceName`

### `GET /v1/capabilities`

Returns currently supported capabilities.

### `GET /v1/context/active-editor`

Requires `Authorization: Bearer <token>`.

Returns an editor snapshot with one of these shapes:

- `kind: "text-editor"`
- `kind: "none"`
- `kind: "unsupported"`

For `text-editor`, the payload includes:

- `document`
- `viewport.visibleRanges`
- `selections`
- `primarySelection`
- `visibleTextBlocks`
- `diagnostics`
- `capturedAt`

All positions are 0-based and follow VS Code's `line` and `character` coordinates.

## Session Files

Session files live under:

- `~/.agent-bridge/active-sessions.json`
- `~/.agent-bridge/sessions/*.json`

The registry file is the source of truth for external agents. Old orphaned session files are cleaned up on extension activation.

## Commands

The extension contributes these commands:

- `Agent Bridge: Enable for Current Workspace`
- `Agent Bridge: Disable for Current Workspace`
- `Agent Bridge: Copy Session File Path`

Clicking the status bar item toggles enable and disable.

## Agent Integrations

Committed agent plugin source lives under [plugins](plugins/README.md).

Current integrations:

- [plugins/opencode](plugins/opencode/README.md)
- [plugins/pi-agent](plugins/pi-agent/README.md)

These integrations intentionally inject only lightweight context into the model:

- document metadata
- primary selection
- diagnostics

They do not inject visible text blocks by default.

## Development

Install dependencies:

```bash
pnpm install
```

Compile:

```bash
pnpm run compile
```

Run tests:

```bash
pnpm test
```

Launch the extension in a VS Code Extension Development Host with `F5`.

## Typical Local Test Flow

1. Open this repository in VS Code.
2. Press `F5` to start an Extension Development Host.
3. In the development host, open a target workspace.
4. Confirm the bridge is enabled.
5. Start OpenCode or Pi in that same target workspace.
6. Verify the agent can resolve the session from `~/.agent-bridge/active-sessions.json`.

## Repository Layout

- [src](src)
  - VS Code extension source
- [plugins](plugins)
  - committed external agent plugin source
- [scripts](scripts)
  - project scripts
