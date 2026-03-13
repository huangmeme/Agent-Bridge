import * as vscode from 'vscode';
import {
  Position,
  Range,
  Selection,
  VisibleTextBlock,
  Diagnostic,
  TextEditorSnapshot,
  NoEditorSnapshot,
  UnsupportedEditorSnapshot,
  EditorSnapshot,
} from '../types';

function toPosition(pos: vscode.Position): Position {
  return {
    line: pos.line,
    character: pos.character,
  };
}

function toRange(range: vscode.Range): Range {
  return {
    start: toPosition(range.start),
    end: toPosition(range.end),
  };
}

function toSelection(sel: vscode.Selection): Selection {
  return {
    anchor: toPosition(sel.anchor),
    active: toPosition(sel.active),
    isReversed: sel.isReversed,
  };
}

function severityToString(severity: vscode.DiagnosticSeverity): Diagnostic['severity'] {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'information';
    case vscode.DiagnosticSeverity.Hint:
      return 'hint';
    default:
      return 'information';
  }
}

function toDiagnostic(diag: vscode.Diagnostic): Diagnostic {
  return {
    range: toRange(diag.range),
    severity: severityToString(diag.severity),
    message: diag.message,
    source: diag.source,
    code: diag.code !== undefined && diag.code !== null
      ? (typeof diag.code === 'object' ? diag.code.value : diag.code)
      : undefined,
  };
}

function getVisibleTextBlocks(
  document: vscode.TextDocument,
  visibleRanges: readonly vscode.Range[]
): VisibleTextBlock[] {
  return visibleRanges.map(range => ({
    range: toRange(range),
    text: document.getText(range),
  }));
}

function getDiagnosticsForDocument(document: vscode.TextDocument): Diagnostic[] {
  const allDiagnostics = vscode.languages.getDiagnostics(document.uri);
  return allDiagnostics.map(toDiagnostic);
}

export function captureSnapshot(): EditorSnapshot {
  const editor = vscode.window.activeTextEditor;
  const capturedAt = new Date().toISOString();

  if (!editor) {
    return {
      kind: 'none',
      capturedAt,
    } as NoEditorSnapshot;
  }

  const document = editor.document;
  const uri = document.uri;

  const unsupportedSchemes = [
    'vscode-notebook-cell',
    'diff',
    'git',
    'output',
    'debug',
    'walkThrough',
    'welcome',
    'vscode-settings',
    'keybinding',
    'workbench',
  ];

  if (unsupportedSchemes.includes(uri.scheme)) {
    return {
      kind: 'unsupported',
      editorType: uri.scheme,
      capturedAt,
    } as UnsupportedEditorSnapshot;
  }

  if (uri.scheme !== 'file' && uri.scheme !== 'untitled') {
    return {
      kind: 'unsupported',
      editorType: uri.scheme,
      capturedAt,
    } as UnsupportedEditorSnapshot;
  }

  const visibleRanges = editor.visibleRanges;
  const selections = editor.selections;
  const primarySelection = selections[0] ?? new vscode.Selection(0, 0, 0, 0);

  const snapshot: TextEditorSnapshot = {
    kind: 'text-editor',
    document: {
      uri: document.uri.toString(),
      languageId: document.languageId,
      version: document.version,
      isDirty: document.isDirty,
      isUntitled: document.isUntitled,
      lineCount: document.lineCount,
    },
    viewport: {
      visibleRanges: visibleRanges.map(toRange),
    },
    selections: selections.map(toSelection),
    primarySelection: toSelection(primarySelection),
    visibleTextBlocks: getVisibleTextBlocks(document, visibleRanges),
    diagnostics: getDiagnosticsForDocument(document),
    capturedAt,
  };

  return snapshot;
}
