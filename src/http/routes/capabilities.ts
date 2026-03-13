import * as http from 'http';
import { CapabilitiesResponse } from '../../types';

export function handleCapabilities(req: http.IncomingMessage, res: http.ServerResponse): void {
  const response: CapabilitiesResponse = {
    capabilities: ['activeTextEditorSnapshot'],
  };

  res.statusCode = 200;
  res.end(JSON.stringify(response));
}
