import * as http from 'http';
import * as vscode from 'vscode';
import { SessionManager } from '../session/manager';
import { handleHealth } from './routes/health';
import { handleCapabilities } from './routes/capabilities';
import { handleActiveEditor } from './routes/context';
import { authenticate } from './middleware/auth';

export class HttpServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  get isRunning(): boolean {
    return this.server !== null;
  }

  get currentPort(): number {
    return this.port;
  }

  async start(): Promise<number> {
    if (this.server) {
      return this.port;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server!.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.server = null;
            this.port = 0;
            resolve();
          }
        });
      });
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    res.setHeader('Content-Type', 'application/json');

    if (url === '/v1/health') {
      handleHealth(req, res, this.sessionManager);
      return;
    }

    if (url === '/v1/capabilities') {
      handleCapabilities(req, res);
      return;
    }

    if (url === '/v1/context/active-editor') {
      if (!authenticate(req, res, this.sessionManager)) {
        return;
      }
      handleActiveEditor(req, res);
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  dispose(): void {
    this.stop();
  }
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}
