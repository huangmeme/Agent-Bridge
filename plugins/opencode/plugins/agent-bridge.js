import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BRIDGE_HOME = path.join(os.homedir(), ".agent-bridge");
const DEFAULT_CONTEXT_CHAR_LIMIT = 12000;
const DEFAULT_DIAGNOSTIC_LIMIT = 8;
const DEFAULT_HTTP_TIMEOUT_MS = 1200;

const lspDiagnosticsCache = new Map();

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function safeFileUriToPath(uri) {
  if (!uri || typeof uri !== "string" || !uri.startsWith("file://")) {
    return null;
  }

  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

function truncateText(text, limit) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n\n...[truncated ${text.length - limit} chars]`;
}

function formatRange(range) {
  if (!range?.start || !range?.end) {
    return "unknown";
  }

  const startLine = Number(range.start.line ?? 0) + 1;
  const startChar = Number(range.start.character ?? 0) + 1;
  const endLine = Number(range.end.line ?? 0) + 1;
  const endChar = Number(range.end.character ?? 0) + 1;
  return `L${startLine}:C${startChar} - L${endLine}:C${endChar}`;
}

function formatSelections(snapshot) {
  const primary = snapshot?.primarySelection;
  if (!primary) {
    return "No active selection";
  }

  const anchor = `L${Number(primary.anchor?.line ?? 0) + 1}:C${Number(primary.anchor?.character ?? 0) + 1}`;
  const active = `L${Number(primary.active?.line ?? 0) + 1}:C${Number(primary.active?.character ?? 0) + 1}`;
  return `${anchor} -> ${active}${primary.isReversed ? " (reversed)" : ""}`;
}

function summarizeDiagnostics(diagnostics, limit) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return "No current document diagnostics reported by VS Code.";
  }

  const lines = diagnostics.slice(0, limit).map((diagnostic) => {
    const severity = String(diagnostic?.severity ?? "unknown").toUpperCase();
    const range = formatRange(diagnostic?.range);
    const source = diagnostic?.source ? ` [${diagnostic.source}]` : "";
    return `- ${severity} ${range}${source}: ${diagnostic?.message ?? "Unknown diagnostic"}`;
  });

  const remaining = diagnostics.length - lines.length;
  if (remaining > 0) {
    lines.push(`- ...and ${remaining} more diagnostics.`);
  }

  return lines.join("\n");
}

function summarizeVisibleText(snapshot, contextCharLimit) {
  if (!Array.isArray(snapshot?.visibleTextBlocks) || snapshot.visibleTextBlocks.length === 0) {
    return "No visible text blocks captured by VS Code.";
  }

  const blocks = snapshot.visibleTextBlocks.map((block, index) => {
    const heading = `Block ${index + 1} (${formatRange(block.range)})`;
    return `${heading}\n${block.text ?? ""}`;
  });

  return truncateText(blocks.join("\n\n"), contextCharLimit);
}

function extractDiagnosticsFromEvent(event) {
  const candidates = [
    event?.diagnostics,
    event?.properties?.diagnostics,
    event?.properties?.params?.diagnostics,
    event?.properties?.payload?.diagnostics,
    event?.data?.diagnostics,
    event?.params?.diagnostics,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function getEventSessionId(event) {
  const candidates = [
    event?.sessionID,
    event?.sessionId,
    event?.properties?.sessionID,
    event?.properties?.sessionId,
    event?.data?.sessionID,
    event?.data?.sessionId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function scoreSessionMatch(session, directory, worktree) {
  const workspacePath = safeFileUriToPath(session?.workspaceUri);
  if (!workspacePath) {
    return -1;
  }

  const workspace = normalizePath(workspacePath);
  const cwd = normalizePath(directory);
  const tree = normalizePath(worktree);

  if (workspace === tree) {
    return 300;
  }

  if (cwd.startsWith(`${workspace}${path.sep}`) || cwd === workspace) {
    return 250;
  }

  if (tree.startsWith(`${workspace}${path.sep}`) || workspace.startsWith(`${tree}${path.sep}`)) {
    return 200;
  }

  return -1;
}

async function loadSessions(bridgeHome) {
  const registryPath = path.join(bridgeHome, "active-sessions.json");

  try {
    const content = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.sessions) ? parsed.sessions : [];
  } catch {
    return [];
  }
}

async function resolveSession({ directory, worktree, bridgeHome }) {
  const sessions = await loadSessions(bridgeHome);
  if (sessions.length === 0) {
    return null;
  }

  const ranked = sessions
    .map((session) => ({
      session,
      score: scoreSessionMatch(session, directory, worktree),
      updatedAt: Date.parse(session?.updatedAt ?? "") || 0,
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);

  return ranked[0]?.session ?? null;
}

async function fetchJson(url, init = {}, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;

    if (text.length > 0) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemContext({
  session,
  snapshot,
  cachedDiagnostics,
  contextCharLimit,
  diagnosticLimit,
}) {
  const blocks = [
    "VS Code bridge context is authoritative for the editor state the user is currently seeing.",
    `Bridge session: ${session.sessionId}`,
    `Workspace: ${session.workspaceName}`,
  ];

  if (!snapshot || typeof snapshot !== "object") {
    blocks.push("Bridge snapshot was unavailable for this turn.");
    return blocks.join("\n\n");
  }

  if (snapshot.kind === "none") {
    blocks.push("There is no active VS Code text editor right now.");
    return blocks.join("\n\n");
  }

  if (snapshot.kind === "unsupported") {
    blocks.push(`The active VS Code editor is unsupported for bridge capture: ${snapshot.editorType}.`);
    return blocks.join("\n\n");
  }

  blocks.push(
    [
      `Document: ${snapshot.document.uri}`,
      `Language: ${snapshot.document.languageId}`,
      `Dirty: ${snapshot.document.isDirty ? "yes" : "no"}`,
      `Untitled: ${snapshot.document.isUntitled ? "yes" : "no"}`,
      `Primary selection: ${formatSelections(snapshot)}`,
    ].join("\n")
  );

  blocks.push(`Visible text\n${summarizeVisibleText(snapshot, contextCharLimit)}`);
  blocks.push(`Current document diagnostics\n${summarizeDiagnostics(snapshot.diagnostics, diagnosticLimit)}`);

  if (cachedDiagnostics) {
    blocks.push(`Recent OpenCode LSP diagnostics\n${cachedDiagnostics}`);
  }

  blocks.push(
    "Use this snapshot for viewport, cursor, selection, and current diagnostics. If filesystem contents disagree, prefer the VS Code snapshot for what the user is actively looking at."
  );

  return blocks.join("\n\n");
}

export const AgentBridgePlugin = async ({ directory, worktree }) => {
  const bridgeHome = process.env.AGENT_BRIDGE_HOME || DEFAULT_BRIDGE_HOME;
  const contextCharLimit = toPositiveInt(
    process.env.AGENT_BRIDGE_CONTEXT_LIMIT,
    DEFAULT_CONTEXT_CHAR_LIMIT
  );
  const diagnosticLimit = toPositiveInt(
    process.env.AGENT_BRIDGE_DIAGNOSTIC_LIMIT,
    DEFAULT_DIAGNOSTIC_LIMIT
  );

  async function getMatchedSession() {
    return resolveSession({
      directory,
      worktree,
      bridgeHome,
    });
  }

  return {
    event: async ({ event }) => {
      if (event?.type !== "lsp.client.diagnostics") {
        return;
      }

      const sessionID = getEventSessionId(event);
      if (!sessionID) {
        return;
      }

      const diagnostics = extractDiagnosticsFromEvent(event);
      lspDiagnosticsCache.set(sessionID, summarizeDiagnostics(diagnostics, diagnosticLimit));
    },

    "shell.env": async (input, output) => {
      const session = await resolveSession({
        directory: input.cwd || directory,
        worktree,
        bridgeHome,
      });

      if (!session) {
        return;
      }

      output.env.AGENT_BRIDGE_HOME = bridgeHome;
      output.env.AGENT_BRIDGE_SESSION_ID = session.sessionId;
      output.env.AGENT_BRIDGE_WORKSPACE = session.workspaceName;
      output.env.AGENT_BRIDGE_ENDPOINT = session.endpoint;
      output.env.AGENT_BRIDGE_TOKEN = session.token;
    },

    "experimental.chat.system.transform": async (input, output) => {
      const session = await getMatchedSession();
      if (!session) {
        return;
      }

      const health = await fetchJson(`${session.endpoint}/v1/health`);
      if (!health.ok || health.data?.status !== "ok") {
        return;
      }

      const snapshotResponse = await fetchJson(`${session.endpoint}/v1/context/active-editor`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (!snapshotResponse.ok || !snapshotResponse.data?.snapshot) {
        return;
      }

      const injected = buildSystemContext({
        session,
        snapshot: snapshotResponse.data.snapshot,
        cachedDiagnostics: lspDiagnosticsCache.get(input.sessionID),
        contextCharLimit,
        diagnosticLimit,
      });

      output.system.push(injected);
    },
  };
};

export default AgentBridgePlugin;
