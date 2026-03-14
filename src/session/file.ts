import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionInfo, ActiveSessionsRegistry } from '../types';

function getAgentBridgeDir(baseDir: string = os.homedir()): string {
  return path.join(baseDir, '.agent-bridge');
}

function getSessionsDir(baseDir: string = os.homedir()): string {
  return path.join(getAgentBridgeDir(baseDir), 'sessions');
}

function getRegistryFilePath(baseDir: string = os.homedir()): string {
  return path.join(getAgentBridgeDir(baseDir), 'active-sessions.json');
}

export function ensureSessionsDir(baseDir: string = os.homedir()): void {
  const sessionsDir = getSessionsDir(baseDir);
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
}

export function getSessionFilePath(sessionId: string, baseDir: string = os.homedir()): string {
  return path.join(getSessionsDir(baseDir), `${sessionId}.json`);
}

export function writeSessionFile(session: SessionInfo, baseDir: string = os.homedir()): void {
  ensureSessionsDir(baseDir);
  const filePath = getSessionFilePath(session.sessionId, baseDir);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

export function readSessionFile(
  sessionId: string,
  baseDir: string = os.homedir()
): SessionInfo | null {
  const filePath = getSessionFilePath(sessionId, baseDir);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as SessionInfo;
  } catch {
    return null;
  }
}

export function deleteSessionFile(sessionId: string, baseDir: string = os.homedir()): void {
  const filePath = getSessionFilePath(sessionId, baseDir);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function readRegistry(baseDir: string = os.homedir()): ActiveSessionsRegistry {
  const registryFile = getRegistryFilePath(baseDir);
  if (!fs.existsSync(registryFile)) {
    return { sessions: [], updatedAt: new Date().toISOString() };
  }
  try {
    const content = fs.readFileSync(registryFile, 'utf-8');
    return JSON.parse(content) as ActiveSessionsRegistry;
  } catch {
    return { sessions: [], updatedAt: new Date().toISOString() };
  }
}

export function writeRegistry(
  registry: ActiveSessionsRegistry,
  baseDir: string = os.homedir()
): void {
  ensureSessionsDir(baseDir);
  registry.updatedAt = new Date().toISOString();
  fs.writeFileSync(getRegistryFilePath(baseDir), JSON.stringify(registry, null, 2), 'utf-8');
}

export function addToRegistry(session: SessionInfo, baseDir: string = os.homedir()): void {
  const registry = readRegistry(baseDir);
  const existingIndex = registry.sessions.findIndex(s => s.sessionId === session.sessionId);
  if (existingIndex >= 0) {
    registry.sessions[existingIndex] = session;
  } else {
    registry.sessions.push(session);
  }
  writeRegistry(registry, baseDir);
}

export function removeFromRegistry(sessionId: string, baseDir: string = os.homedir()): void {
  const registry = readRegistry(baseDir);
  registry.sessions = registry.sessions.filter(s => s.sessionId !== sessionId);
  writeRegistry(registry, baseDir);
}

export function cleanupOrphanedSessionFiles(baseDir: string = os.homedir()): void {
  const sessionsDir = getSessionsDir(baseDir);
  const registry = readRegistry(baseDir);
  const activeSessionIds = new Set(registry.sessions.map((session) => session.sessionId));

  if (fs.existsSync(sessionsDir)) {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name) !== '.json') {
        continue;
      }

      const sessionId = path.basename(entry.name, '.json');
      if (!activeSessionIds.has(sessionId)) {
        fs.unlinkSync(path.join(sessionsDir, entry.name));
      }
    }
  }

  const existingSessions = registry.sessions.filter((session) =>
    fs.existsSync(getSessionFilePath(session.sessionId, baseDir))
  );

  if (existingSessions.length !== registry.sessions.length) {
    writeRegistry(
      {
        sessions: existingSessions,
        updatedAt: registry.updatedAt,
      },
      baseDir
    );
  }
}

export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

export function generateToken(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}
