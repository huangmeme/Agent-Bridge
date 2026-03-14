import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  cleanupOrphanedSessionFiles,
  getSessionFilePath,
  readRegistry,
  writeRegistry,
  writeSessionFile,
} from '../../session/file';
import { SessionInfo } from '../../types';

function createSession(sessionId: string, workspaceName: string): SessionInfo {
  const now = new Date().toISOString();
  return {
    sessionId,
    workspaceUri: `file:///tmp/${workspaceName}`,
    workspaceName,
    endpoint: 'http://127.0.0.1:12345',
    token: `${sessionId}-token`,
    capabilities: ['activeTextEditorSnapshot'],
    createdAt: now,
    updatedAt: now,
  };
}

suite('Session Files', () => {
  test('cleanup removes orphaned session files and stale registry entries', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-session-files-'));
    const activeSession = createSession('active-session', 'active');
    const orphanSession = createSession('orphan-session', 'orphan');
    const missingSession = createSession('missing-session', 'missing');

    writeSessionFile(activeSession, tempHome);
    writeSessionFile(orphanSession, tempHome);
    writeRegistry(
      {
        sessions: [activeSession, missingSession],
        updatedAt: new Date().toISOString(),
      },
      tempHome
    );

    cleanupOrphanedSessionFiles(tempHome);

    assert.ok(fs.existsSync(getSessionFilePath(activeSession.sessionId, tempHome)));
    assert.ok(!fs.existsSync(getSessionFilePath(orphanSession.sessionId, tempHome)));

    const registry = readRegistry(tempHome);
    assert.deepStrictEqual(
      registry.sessions.map((session) => session.sessionId),
      [activeSession.sessionId]
    );
  });
});
