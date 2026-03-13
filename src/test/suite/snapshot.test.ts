import * as assert from 'assert';
import * as vscode from 'vscode';
import { captureSnapshot } from '../../context/snapshot';

suite('Snapshot Capture', () => {
  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('captures visible text and dirty untitled editor state', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: 'alpha\nbeta\ngamma\n',
    });

    const editor = await vscode.window.showTextDocument(document);
    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 4), '-dirty');
    });

    editor.selection = new vscode.Selection(1, 0, 1, 4);

    const snapshot = captureSnapshot();

    assert.strictEqual(snapshot.kind, 'text-editor');
    assert.strictEqual(snapshot.document.isUntitled, true);
    assert.strictEqual(snapshot.document.isDirty, true);
    assert.ok(snapshot.visibleTextBlocks.length > 0);
    assert.ok(snapshot.visibleTextBlocks.some((block) => block.text.includes('beta-dirty')));
    assert.strictEqual(snapshot.primarySelection.anchor.line, 1);
    assert.strictEqual(snapshot.primarySelection.active.character, 4);
  });
});
