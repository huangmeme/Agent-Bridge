import * as http from 'http';
import * as vscode from 'vscode';
import { captureSnapshot } from '../../context/snapshot';
import { ActiveEditorResponse } from '../../types';

export function handleActiveEditor(req: http.IncomingMessage, res: http.ServerResponse): void {
  const snapshot = captureSnapshot();
  const response: ActiveEditorResponse = {
    snapshot,
  };

  res.statusCode = 200;
  res.end(JSON.stringify(response));
}
