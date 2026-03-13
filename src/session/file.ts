import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionInfo, ActiveSessionsRegistry } from '../types';

const SESSIONS_DIR = path.join(os.homedir(), '.agent-bridge', 'sessions');
const REGISTRY_FILE = path.join(os.homedir(), '.agent-bridge', 'active-sessions.json');

export function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function getSessionFilePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

export function writeSessionFile(session: SessionInfo): void {
  ensureSessionsDir();
  const filePath = getSessionFilePath(session.sessionId);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

export function readSessionFile(sessionId: string): SessionInfo | null {
  const filePath = getSessionFilePath(sessionId);
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

export function deleteSessionFile(sessionId: string): void {
  const filePath = getSessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function readRegistry(): ActiveSessionsRegistry {
  if (!fs.existsSync(REGISTRY_FILE)) {
    return { sessions: [], updatedAt: new Date().toISOString() };
  }
  try {
    const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
    return JSON.parse(content) as ActiveSessionsRegistry;
  } catch {
    return { sessions: [], updatedAt: new Date().toISOString() };
  }
}

export function writeRegistry(registry: ActiveSessionsRegistry): void {
  ensureSessionsDir();
  registry.updatedAt = new Date().toISOString();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

export function addToRegistry(session: SessionInfo): void {
  const registry = readRegistry();
  const existingIndex = registry.sessions.findIndex(s => s.sessionId === session.sessionId);
  if (existingIndex >= 0) {
    registry.sessions[existingIndex] = session;
  } else {
    registry.sessions.push(session);
  }
  writeRegistry(registry);
}

export function removeFromRegistry(sessionId: string): void {
  const registry = readRegistry();
  registry.sessions = registry.sessions.filter(s => s.sessionId !== sessionId);
  writeRegistry(registry);
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
