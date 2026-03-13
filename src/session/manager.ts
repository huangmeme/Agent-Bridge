import * as vscode from 'vscode';
import { SessionInfo } from '../types';
import {
  generateSessionId,
  generateToken,
  writeSessionFile,
  deleteSessionFile,
  addToRegistry,
  removeFromRegistry,
} from './file';

export class SessionManager {
  private currentSession: SessionInfo | null = null;
  private port: number = 0;

  constructor() {}

  get session(): SessionInfo | null {
    return this.currentSession;
  }

  get isEnabled(): boolean {
    return this.currentSession !== null;
  }

  get token(): string | null {
    return this.currentSession?.token ?? null;
  }

  get sessionId(): string | null {
    return this.currentSession?.sessionId ?? null;
  }

  get currentPort(): number {
    return this.port;
  }

  setPort(port: number): void {
    this.port = port;
    if (this.currentSession) {
      this.currentSession.endpoint = `http://127.0.0.1:${port}`;
      this.currentSession.updatedAt = new Date().toISOString();
      writeSessionFile(this.currentSession);
      addToRegistry(this.currentSession);
    }
  }

  async enable(workspaceFolder: vscode.WorkspaceFolder, port: number): Promise<SessionInfo> {
    if (this.currentSession) {
      await this.disable();
    }

    const sessionId = generateSessionId();
    const token = generateToken();

    this.currentSession = {
      sessionId,
      workspaceUri: workspaceFolder.uri.toString(),
      workspaceName: workspaceFolder.name,
      endpoint: `http://127.0.0.1:${port}`,
      token,
      capabilities: ['activeTextEditorSnapshot'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.port = port;

    writeSessionFile(this.currentSession);
    addToRegistry(this.currentSession);

    return this.currentSession;
  }

  async disable(): Promise<void> {
    if (this.currentSession) {
      deleteSessionFile(this.currentSession.sessionId);
      removeFromRegistry(this.currentSession.sessionId);
      this.currentSession = null;
      this.port = 0;
    }
  }

  dispose(): void {
    this.disable();
  }
}
