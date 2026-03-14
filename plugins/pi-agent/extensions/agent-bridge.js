import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BRIDGE_HOME = path.join(os.homedir(), ".agent-bridge");
const DEFAULT_DIAGNOSTIC_LIMIT = 8;
const DEFAULT_HTTP_TIMEOUT_MS = 1200;

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

function formatSelection(snapshot) {
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

function scoreSessionMatch(session, cwd) {
  const workspacePath = safeFileUriToPath(session?.workspaceUri);
  if (!workspacePath || !cwd) {
    return -1;
  }

  const workspace = normalizePath(workspacePath);
  const currentDir = normalizePath(cwd);

  if (workspace === currentDir) {
    return 300;
  }

  if (currentDir.startsWith(`${workspace}${path.sep}`)) {
    return 250;
  }

  if (workspace.startsWith(`${currentDir}${path.sep}`)) {
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

async function resolveSession({ cwd, bridgeHome }) {
  const sessions = await loadSessions(bridgeHome);
  if (sessions.length === 0) {
    return null;
  }

  const ranked = sessions
    .map((session) => ({
      session,
      score: scoreSessionMatch(session, cwd),
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

function buildSystemPrompt({
  session,
  snapshot,
  diagnosticLimit,
}) {
  const sections = [
    "VS Code bridge context is authoritative for the editor state the user is currently seeing.",
    `Bridge session: ${session.sessionId}`,
    `Workspace: ${session.workspaceName}`,
  ];

  if (!snapshot || typeof snapshot !== "object") {
    sections.push("Bridge snapshot was unavailable for this turn.");
    return sections.join("\n\n");
  }

  if (snapshot.kind === "none") {
    sections.push("There is no active VS Code text editor right now.");
    return sections.join("\n\n");
  }

  if (snapshot.kind === "unsupported") {
    sections.push(`The active VS Code editor is unsupported for bridge capture: ${snapshot.editorType}.`);
    return sections.join("\n\n");
  }

  sections.push(
    [
      `Document: ${snapshot.document.uri}`,
      `Language: ${snapshot.document.languageId}`,
      `Dirty: ${snapshot.document.isDirty ? "yes" : "no"}`,
      `Untitled: ${snapshot.document.isUntitled ? "yes" : "no"}`,
      `Primary selection: ${formatSelection(snapshot)}`,
    ].join("\n")
  );

  sections.push(`Current document diagnostics\n${summarizeDiagnostics(snapshot.diagnostics, diagnosticLimit)}`);
  sections.push(
    "Use this snapshot for viewport, cursor, selection, and current diagnostics. If filesystem contents disagree, prefer the VS Code snapshot for what the user is actively looking at."
  );

  return sections.join("\n\n");
}

async function describeConnection({ cwd, bridgeHome }) {
  const session = await resolveSession({ cwd, bridgeHome });
  if (!session) {
    return {
      session: null,
      message: "No matching VS Code bridge session found for the current Pi working directory.",
    };
  }

  const health = await fetchJson(`${session.endpoint}/v1/health`);
  if (!health.ok || health.data?.status !== "ok") {
    return {
      session,
      message: `Matched VS Code bridge session "${session.workspaceName}", but it is not currently healthy.`,
    };
  }

  return {
    session,
    message: `Connected to VS Code bridge workspace "${session.workspaceName}" (${session.sessionId}).`,
  };
}

export default function agentBridgePiExtension(pi) {
  const bridgeHome = process.env.AGENT_BRIDGE_HOME || DEFAULT_BRIDGE_HOME;
  const diagnosticLimit = toPositiveInt(
    process.env.AGENT_BRIDGE_DIAGNOSTIC_LIMIT,
    DEFAULT_DIAGNOSTIC_LIMIT
  );

  pi.registerCommand("bridge-status", {
    description: "Show the current VS Code Agent Bridge connection status",
    handler: async (_args, ctx) => {
      const { message } = await describeConnection({
        cwd: ctx.cwd,
        bridgeHome,
      });

      if (ctx.hasUI) {
        ctx.ui.notify(message, "info");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }

    const { session } = await describeConnection({
      cwd: ctx.cwd,
      bridgeHome,
    });

    ctx.ui.setStatus(
      "agent-bridge",
      session ? "Bridge" : "Bridge unavailable"
    );
  });

  pi.on("session_switch", async (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }

    const { session } = await describeConnection({
      cwd: ctx.cwd,
      bridgeHome,
    });

    ctx.ui.setStatus(
      "agent-bridge",
      session ? "Bridge" : "Bridge unavailable"
    );
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const session = await resolveSession({
      cwd: ctx.cwd,
      bridgeHome,
    });

    if (!session) {
      return undefined;
    }

    const health = await fetchJson(`${session.endpoint}/v1/health`);
    if (!health.ok || health.data?.status !== "ok") {
      return undefined;
    }

    const snapshotResponse = await fetchJson(`${session.endpoint}/v1/context/active-editor`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!snapshotResponse.ok || !snapshotResponse.data?.snapshot) {
      return undefined;
    }

    const injected = buildSystemPrompt({
      session,
      snapshot: snapshotResponse.data.snapshot,
      diagnosticLimit,
    });

    return {
      systemPrompt: `${event.systemPrompt}\n\n${injected}`,
    };
  });
}
