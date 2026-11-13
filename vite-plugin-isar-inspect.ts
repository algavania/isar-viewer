import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function resolveHomePath(inputPath: string): string {
  let trimmed = inputPath.trim().replace(/^["']|["']$/g, '');
  if (trimmed.startsWith('~/') || trimmed === '~') {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  return path.resolve(process.cwd(), trimmed);
}

function handleInspectMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url) {
    next();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ ok: true, devServer: true }));
    return;
  }

  if (pathname === '/api/file') {
    const rawPath = parsedUrl.searchParams.get('path');
    if (!rawPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path query parameter' }));
      return;
    }

    try {
      const resolved = resolveHomePath(rawPath);
      if (!fs.existsSync(resolved)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `File not found: ${resolved}` }));
        return;
      }

      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Target path is not a file: ${resolved}` }));
        return;
      }

      const buffer = fs.readFileSync(resolved);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.length,
        'X-File-Name': path.basename(resolved),
        'X-Resolved-Path': resolved,
        'X-Last-Modified': stat.mtimeMs.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-File-Name, X-Resolved-Path, X-Last-Modified',
      });
      res.end(buffer);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      return;
    }
  }

  if (pathname === '/api/watch') {
    const rawPath = parsedUrl.searchParams.get('path');
    if (!rawPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path query parameter' }));
      return;
    }

    let resolved: string;
    try {
      resolved = resolveHomePath(rawPath);
      if (!fs.existsSync(resolved)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `File not found: ${resolved}` }));
        return;
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const initialStat = fs.statSync(resolved);
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        path: resolved,
        fileName: path.basename(resolved),
        size: initialStat.size,
        mtime: initialStat.mtimeMs,
      })}\n\n`
    );

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastMtime = initialStat.mtimeMs;
    let lastSize = initialStat.size;

    const notifyChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          if (!fs.existsSync(resolved)) return;
          const currentStats = fs.statSync(resolved);
          if (currentStats.mtimeMs !== lastMtime || currentStats.size !== lastSize) {
            lastMtime = currentStats.mtimeMs;
            lastSize = currentStats.size;
            res.write(
              `event: change\ndata: ${JSON.stringify({
                path: resolved,
                fileName: path.basename(resolved),
                mtime: currentStats.mtimeMs,
                size: currentStats.size,
              })}\n\n`
            );
          }
        } catch {
          // File may be locked briefly while being written
        }
      }, 150);
    };

    let fsWatcher: fs.FSWatcher | null = null;
    try {
      fsWatcher = fs.watch(resolved, () => notifyChange());
    } catch {
      // Fallback to watchFile if fs.watch is not supported
    }

    fs.watchFile(resolved, { interval: 500 }, () => notifyChange());

    const pingTimer = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(pingTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      try {
        fsWatcher?.close();
      } catch {}
      try {
        fs.unwatchFile(resolved);
      } catch {}
    });

    return;
  }

  next();
}

export function isarInspectPlugin(): Plugin {
  return {
    name: 'isar-inspect-plugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handleInspectMiddleware);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handleInspectMiddleware);
    },
  };
}
