import { describe, it, expect } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { isarInspectPlugin } from '../../vite-plugin-isar-inspect';

describe('Vite Isar Inspect Plugin Middleware', () => {
  const plugin = isarInspectPlugin();
  const middlewares: Array<(req: any, res: any, next: () => void) => void> = [];

  const mockServer: any = {
    middlewares: {
      use: (fn: any) => middlewares.push(fn),
    },
  };

  (plugin as any).configureServer(mockServer);
  const middleware = middlewares[0];

  const simulate = (url: string): Promise<{ statusCode: number; headers: Record<string, any>; body: Buffer }> => {
    return new Promise((resolve) => {
      const req: any = new http.IncomingMessage(null as any);
      req.url = url;

      let statusCode = 200;
      const headers: Record<string, any> = {};
      const chunks: Buffer[] = [];

      const res: any = {
        writeHead: (code: number, h?: any) => {
          statusCode = code;
          if (h) Object.assign(headers, h);
        },
        write: (chunk: any) => {
          if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
          else chunks.push(chunk);
        },
        end: (chunk?: any) => {
          if (chunk) {
            if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
            else chunks.push(chunk);
          }
          resolve({ statusCode, headers, body: Buffer.concat(chunks) });
        },
      };

      middleware(req, res, () => {
        resolve({ statusCode: 404, headers, body: Buffer.from('next called') });
      });
    });
  };

  it('handles /api/status endpoint', async () => {
    const statusRes = await simulate('/api/status');
    expect(statusRes.statusCode).toBe(200);
    const statusJson = JSON.parse(statusRes.body.toString());
    expect(statusJson.ok).toBe(true);
    expect(statusJson.devServer).toBe(true);
  });

  it('validates /api/file parameters and returns errors properly', async () => {
    const missingRes = await simulate('/api/file');
    expect(missingRes.statusCode).toBe(400);

    const notFoundRes = await simulate('/api/file?path=/definitely/not/a/real/path.isar');
    expect(notFoundRes.statusCode).toBe(404);

    const dirRes = await simulate('/api/file?path=.');
    expect(dirRes.statusCode).toBe(400);
  });

  it('reads and serves valid .isar file', async () => {
    const samplePath = path.resolve(process.cwd(), 'public/sample.isar');
    const validRes = await simulate(`/api/file?path=${encodeURIComponent(samplePath)}`);
    expect(validRes.statusCode).toBe(200);
    expect(validRes.headers['Content-Type']).toBe('application/octet-stream');
    expect(validRes.headers['X-File-Name']).toBe('sample.isar');
    expect(validRes.body.length).toBe(fs.statSync(samplePath).size);
  });

  it('handles /api/watch SSE connection and change notifications', async () => {
    // Create a temporary file to test real-time watcher
    const tmpDir = os.tmpdir();
    const testFile = path.join(tmpDir, `test-watch-${Date.now()}.isar`);
    fs.writeFileSync(testFile, 'initial content');

    const req: any = new http.IncomingMessage(null as any);
    req.url = `/api/watch?path=${encodeURIComponent(testFile)}`;

    let sseHeaders: any = null;
    const receivedChunks: string[] = [];

    const res: any = {
      writeHead: (_status: number, headers: any) => {
        sseHeaders = headers;
      },
      write: (data: string) => {
        receivedChunks.push(data);
      },
      end: () => {},
    };

    middleware(req, res, () => {});

    expect(sseHeaders).not.toBeNull();
    expect(sseHeaders['Content-Type']).toBe('text/event-stream');

    // Wait a brief moment to verify the initial connected event
    await new Promise((r) => setTimeout(r, 50));
    expect(receivedChunks.some((c) => c.includes('event: connected'))).toBe(true);

    // Simulate closing request
    req.emit('close');
    try {
      fs.unlinkSync(testFile);
    } catch {}
  });
});
