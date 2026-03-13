export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Selection {
  anchor: Position;
  active: Position;
  isReversed: boolean;
}

export interface VisibleTextBlock {
  range: Range;
  text: string;
}

export interface Diagnostic {
  range: Range;
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  source?: string;
  code?: string | number;
}

export interface TextEditorSnapshot {
  kind: 'text-editor';
  document: {
    uri: string;
    languageId: string;
    version: number;
    isDirty: boolean;
    isUntitled: boolean;
    lineCount: number;
  };
  viewport: {
    visibleRanges: Range[];
  };
  selections: Selection[];
  primarySelection: Selection;
  visibleTextBlocks: VisibleTextBlock[];
  diagnostics: Diagnostic[];
  capturedAt: string;
}

export interface NoEditorSnapshot {
  kind: 'none';
  capturedAt: string;
}

export interface UnsupportedEditorSnapshot {
  kind: 'unsupported';
  editorType: string;
  capturedAt: string;
}

export type EditorSnapshot = TextEditorSnapshot | NoEditorSnapshot | UnsupportedEditorSnapshot;

export interface HealthResponse {
  status: 'ok' | 'disabled';
  version: string;
  sessionId: string | null;
  workspaceName: string | null;
}

export interface CapabilitiesResponse {
  capabilities: string[];
}

export interface ActiveEditorResponse {
  snapshot: EditorSnapshot;
}

export interface SessionInfo {
  sessionId: string;
  workspaceUri: string;
  workspaceName: string;
  endpoint: string;
  token: string;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ActiveSessionsRegistry {
  sessions: SessionInfo[];
  updatedAt: string;
}
