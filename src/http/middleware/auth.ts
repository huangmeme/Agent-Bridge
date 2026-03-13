import * as http from 'http';
import { SessionManager } from '../../session/manager';

export function authenticate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionManager: SessionManager
): boolean {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.end(JSON.stringify({ error: 'Missing or invalid Authorization header' }));
    return false;
  }

  const token = authHeader.substring(7);
  const expectedToken = sessionManager.token;

  if (!expectedToken || token !== expectedToken) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: 'Invalid token' }));
    return false;
  }

  if (!sessionManager.isEnabled) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'Workspace not enabled' }));
    return false;
  }

  return true;
}
