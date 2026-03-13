import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('agent-bridge.agent-bridge'));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('agent-bridge.agent-bridge');
    if (ext) {
      await ext.activate();
      assert.ok(ext.isActive);
    }
  });

  test('Commands should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('agentBridge.enableWorkspace'));
    assert.ok(commands.includes('agentBridge.disableWorkspace'));
    assert.ok(commands.includes('agentBridge.copySessionFilePath'));
  });
});
