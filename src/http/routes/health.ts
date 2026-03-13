import * as http from 'http';
import { SessionManager } from '../../session/manager';
import { HealthResponse } from '../../types';

export function handleHealth(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionManager: SessionManager
): void {
  const extension = require('../../../package.json');
  const response: HealthResponse = {
    status: sessionManager.isEnabled ? 'ok' : 'disabled',
    version: extension.version,
    sessionId: sessionManager.sessionId,
    workspaceName: sessionManager.session?.workspaceName ?? null,
  };

  res.statusCode = 200;
  res.end(JSON.stringify(response));
}
