# OpenCode Plugin

Committed OpenCode plugin source for Agent Bridge lives here.

## Entry Point

- `plugins/opencode/plugins/agent-bridge.js`

## Local OpenCode Loading

Keep your machine-specific OpenCode loading directory outside version control.

For example, create a local `.opencode/plugins/` entry that points at this committed file:

- source: `plugins/opencode/plugins/agent-bridge.js`
- local loader path: `.opencode/plugins/agent-bridge.js`

This keeps repository source code and local tool wiring separate.

## Optional environment variables

- `AGENT_BRIDGE_HOME`
  - Override the default bridge home directory. Defaults to `~/.agent-bridge`.
- `AGENT_BRIDGE_CONTEXT_LIMIT`
  - Maximum injected visible-text character count. Defaults to `12000`.
- `AGENT_BRIDGE_DIAGNOSTIC_LIMIT`
  - Maximum diagnostics included in summaries. Defaults to `8`.
