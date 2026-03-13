import * as vscode from 'vscode';
import { SessionManager } from './session/manager';
import { HttpServer } from './http/server';
import { getSessionFilePath } from './session/file';

let sessionManager: SessionManager;
let httpServer: HttpServer;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  sessionManager = new SessionManager();
  httpServer = new HttpServer(sessionManager);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'agentBridge.enableWorkspace';
  updateStatusBar();
  statusBarItem.show();

  const enableWorkspaceCmd = vscode.commands.registerCommand(
    'agentBridge.enableWorkspace',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      let targetWorkspace: vscode.WorkspaceFolder | undefined;

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        targetWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      }

      if (!targetWorkspace) {
        if (workspaceFolders.length === 1) {
          targetWorkspace = workspaceFolders[0];
        } else {
          const picks = workspaceFolders.map(f => ({
            label: f.name,
            description: f.uri.fsPath,
            folder: f,
          }));
          const selected = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Select workspace folder to enable',
          });
          if (!selected) {
            return;
          }
          targetWorkspace = selected.folder;
        }
      }

      const confirm = await vscode.window.showInformationMessage(
        `Enable Agent Bridge for workspace "${targetWorkspace.name}"?`,
        'Yes',
        'No'
      );

      if (confirm !== 'Yes') {
        return;
      }

      try {
        if (!httpServer.isRunning) {
          const port = await httpServer.start();
          console.log(`HTTP server started on port ${port}`);
        }

        await sessionManager.enable(targetWorkspace, httpServer.currentPort);
        updateStatusBar();

        const sessionPath = getSessionFilePath(sessionManager.sessionId!);
        vscode.window.showInformationMessage(
          `Agent Bridge enabled. Session file: ${sessionPath}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to enable Agent Bridge: ${err}`);
      }
    }
  );

  const disableWorkspaceCmd = vscode.commands.registerCommand(
    'agentBridge.disableWorkspace',
    async () => {
      try {
        await sessionManager.disable();
        updateStatusBar();
        vscode.window.showInformationMessage('Agent Bridge disabled');
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to disable Agent Bridge: ${err}`);
      }
    }
  );

  const copySessionFilePathCmd = vscode.commands.registerCommand(
    'agentBridge.copySessionFilePath',
    async () => {
      const sessionId = sessionManager.sessionId;
      if (!sessionId) {
        vscode.window.showWarningMessage('Agent Bridge is not enabled');
        return;
      }

      const sessionPath = getSessionFilePath(sessionId);
      await vscode.env.clipboard.writeText(sessionPath);
      vscode.window.showInformationMessage(`Session file path copied: ${sessionPath}`);
    }
  );

  context.subscriptions.push(
    enableWorkspaceCmd,
    disableWorkspaceCmd,
    copySessionFilePathCmd,
    statusBarItem,
    {
      dispose: async () => {
        await sessionManager.disable();
        await httpServer.stop();
      },
    }
  );

  vscode.window.onDidChangeActiveTextEditor(() => {
    updateStatusBar();
  });
}

function updateStatusBar(): void {
  if (!sessionManager.isEnabled) {
    statusBarItem.text = '$(plug) Agent Bridge: Disabled';
    statusBarItem.tooltip = 'Click to enable Agent Bridge';
  } else if (!vscode.window.activeTextEditor) {
    statusBarItem.text = '$(plug) Agent Bridge: No Active Editor';
    statusBarItem.tooltip = 'Agent Bridge is enabled';
  } else {
    statusBarItem.text = '$(check) Agent Bridge: Enabled';
    statusBarItem.tooltip = `Session: ${sessionManager.sessionId}`;
  }
}

export async function deactivate(): Promise<void> {
  await sessionManager.disable();
  await httpServer.stop();
}
