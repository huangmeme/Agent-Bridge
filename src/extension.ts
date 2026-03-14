import * as vscode from 'vscode';
import { SessionManager } from './session/manager';
import { HttpServer } from './http/server';
import { cleanupOrphanedSessionFiles, getSessionFilePath } from './session/file';

let sessionManager: SessionManager;
let httpServer: HttpServer;
let statusBarItem: vscode.StatusBarItem;

export function getTargetWorkspaceFromActiveEditor(
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
  activeEditor: vscode.TextEditor | undefined
): vscode.WorkspaceFolder | undefined {
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  if (activeEditor) {
    const activeWorkspace = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (activeWorkspace) {
      return activeWorkspace;
    }
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }

  return undefined;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  cleanupOrphanedSessionFiles();

  sessionManager = new SessionManager();
  httpServer = new HttpServer(sessionManager);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar();

  const enableWorkspaceCmd = vscode.commands.registerCommand(
    'agentBridge.enableWorkspace',
    async () => {
      await enableBridge(true);
    }
  );

  const disableWorkspaceCmd = vscode.commands.registerCommand(
    'agentBridge.disableWorkspace',
    async () => {
      await disableBridge(true);
    }
  );

  const toggleWorkspaceCmd = vscode.commands.registerCommand(
    'agentBridge.toggleWorkspace',
    async () => {
      if (sessionManager.isEnabled) {
        await disableBridge(true);
      } else {
        await enableBridge(true);
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
    toggleWorkspaceCmd,
    copySessionFilePathCmd,
    statusBarItem,
    {
      dispose: async () => {
        await sessionManager.disable();
        await httpServer.stop();
      },
    }
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateStatusBar();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      if (!sessionManager.isEnabled) {
        await enableBridge(false);
      } else {
        updateStatusBar();
      }
    })
  );

  await enableBridge(false);
}

function updateStatusBar(): void {
  if (!sessionManager.isEnabled) {
    statusBarItem.text = '$(circle-slash) Bridge';
    statusBarItem.tooltip = 'Agent Bridge is disabled. Click to enable.';
    statusBarItem.command = 'agentBridge.toggleWorkspace';
    statusBarItem.show();
  } else {
    statusBarItem.text = 'Bridge';
    statusBarItem.tooltip = `Agent Bridge is enabled. Click to disable.\nSession: ${sessionManager.sessionId}`;
    statusBarItem.command = 'agentBridge.toggleWorkspace';
    statusBarItem.show();
  }
}

async function ensureServerRunning(): Promise<void> {
  if (!httpServer.isRunning) {
    const port = await httpServer.start();
    console.log(`HTTP server started on port ${port}`);
  }
}

async function resolveTargetWorkspace(
  interactive: boolean
): Promise<vscode.WorkspaceFolder | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    if (interactive) {
      vscode.window.showErrorMessage('No workspace folder open');
    }
    return undefined;
  }

  const targetWorkspace = getTargetWorkspaceFromActiveEditor(
    workspaceFolders,
    vscode.window.activeTextEditor
  );

  if (targetWorkspace) {
    return targetWorkspace;
  }

  if (!interactive) {
    return workspaceFolders[0];
  }

  const picks = workspaceFolders.map(f => ({
    label: f.name,
    description: f.uri.fsPath,
    folder: f,
  }));
  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: 'Select workspace folder to enable',
  });
  return selected?.folder;
}

async function enableBridge(showMessage: boolean): Promise<void> {
  try {
    const targetWorkspace = await resolveTargetWorkspace(showMessage);
    if (!targetWorkspace) {
      updateStatusBar();
      return;
    }

    await ensureServerRunning();
    await sessionManager.enable(targetWorkspace, httpServer.currentPort);
    updateStatusBar();

    if (showMessage) {
      const sessionPath = getSessionFilePath(sessionManager.sessionId!);
      vscode.window.showInformationMessage(
        `Agent Bridge enabled. Session file: ${sessionPath}`
      );
    }
  } catch (err) {
    updateStatusBar();
    vscode.window.showErrorMessage(`Failed to enable Agent Bridge: ${err}`);
  }
}

async function disableBridge(showMessage: boolean): Promise<void> {
  try {
    await sessionManager.disable();
    updateStatusBar();

    if (showMessage) {
      vscode.window.showInformationMessage('Agent Bridge disabled');
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to disable Agent Bridge: ${err}`);
  }
}

export async function deactivate(): Promise<void> {
  await sessionManager.disable();
  await httpServer.stop();
}
