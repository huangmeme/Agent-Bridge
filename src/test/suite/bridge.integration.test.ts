import * as assert from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getTargetWorkspaceFromActiveEditor } from '../../extension';
import { HttpServer } from '../../http/server';
import { SessionManager } from '../../session/manager';

type JsonResponse = {
  statusCode: number;
  body: any;
};

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-bridge-tests-'));

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replaceWorkspaceFolders(
  folders: Array<{ uri: vscode.Uri; name: string }>
): Promise<void> {
  const current = vscode.workspace.workspaceFolders ?? [];
  if (current.length > 0) {
    vscode.workspace.updateWorkspaceFolders(0, current.length);
    await delay(200);
  }

  if (folders.length > 0) {
    vscode.workspace.updateWorkspaceFolders(0, 0, ...folders);
    await delay(200);
  }
}

function requestJson(url: string, headers: Record<string, string> = {}): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      url,
      {
        headers,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: raw.length > 0 ? JSON.parse(raw) : undefined,
          });
        });
      }
    );

    req.on('error', reject);
  });
}

suite('Bridge Integration', () => {
  teardown(async () => {
    await vscode.commands.executeCommand('agentBridge.disableWorkspace');
    await replaceWorkspaceFolders([]);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('enableWorkspace binds session to the active editor workspace', async () => {
    const workspaceA = path.join(testRoot, 'root-a');
    const workspaceB = path.join(testRoot, 'root-b');
    fs.mkdirSync(workspaceA, { recursive: true });
    fs.mkdirSync(workspaceB, { recursive: true });

    const activeFilePath = path.join(workspaceB, 'active.ts');
    fs.writeFileSync(activeFilePath, 'const answer = 42;\n', 'utf8');

    await replaceWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceA), name: 'root-a' },
      { uri: vscode.Uri.file(workspaceB), name: 'root-b' },
    ]);

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(activeFilePath));
    await vscode.window.showTextDocument(document);
    const targetWorkspace = getTargetWorkspaceFromActiveEditor(
      vscode.workspace.workspaceFolders,
      vscode.window.activeTextEditor
    );

    assert.ok(targetWorkspace, 'expected a workspace for the active editor');
    assert.strictEqual(targetWorkspace!.name, 'root-b');
  });

  test('health stays available after disable and protected route reports disabled', async () => {
    const workspaceDir = path.join(testRoot, 'health-workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const activeFilePath = path.join(workspaceDir, 'health.ts');
    fs.writeFileSync(activeFilePath, 'export const health = true;\n', 'utf8');

    await replaceWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceDir), name: 'health-workspace' },
    ]);

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(activeFilePath));
    await vscode.window.showTextDocument(document);

    const sessionManager = new SessionManager();
    const httpServer = new HttpServer(sessionManager);
    const port = await httpServer.start();

    try {
      const workspaceFolder = {
        uri: vscode.Uri.file(workspaceDir),
        name: 'health-workspace',
        index: 0,
      } as vscode.WorkspaceFolder;

      const session = await sessionManager.enable(workspaceFolder, port);

      const okHealth = await requestJson(`${session.endpoint}/v1/health`);
      assert.strictEqual(okHealth.statusCode, 200);
      assert.strictEqual(okHealth.body.status, 'ok');

      const activeEditor = await requestJson(`${session.endpoint}/v1/context/active-editor`, {
        Authorization: `Bearer ${session.token}`,
      });
      assert.strictEqual(activeEditor.statusCode, 200);
      assert.strictEqual(activeEditor.body.snapshot.kind, 'text-editor');
      assert.strictEqual(activeEditor.body.snapshot.document.uri, document.uri.toString());

      await sessionManager.disable();

      const disabledHealth = await requestJson(`${session.endpoint}/v1/health`);
      assert.strictEqual(disabledHealth.statusCode, 200);
      assert.strictEqual(disabledHealth.body.status, 'disabled');

      const disabledContext = await requestJson(`${session.endpoint}/v1/context/active-editor`, {
        Authorization: `Bearer ${session.token}`,
      });
      assert.strictEqual(disabledContext.statusCode, 503);
      assert.strictEqual(disabledContext.body.error, 'Workspace not enabled');
    } finally {
      await sessionManager.disable();
      await httpServer.stop();
    }
  });
});
