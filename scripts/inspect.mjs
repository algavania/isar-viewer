#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

function resolveHome(input) {
  if (input.startsWith('~/') || input === '~') {
    return path.join(os.homedir(), input.slice(1));
  }
  return path.resolve(process.cwd(), input);
}

const targetArg = process.argv[2];

if (!targetArg) {
  console.log(`
⚡ Isar Viewer Realtime Inspector CLI

Usage:
  npm run inspect <path-to-isar-file>

Examples:
  npm run inspect ./public/sample.isar
  npm run inspect ~/Library/Containers/com.example.app/Data/Documents/default.isar
  npm run inspect /sdcard/Android/data/com.example.app/files/default.isar
`);
  process.exit(1);
}

const resolved = resolveHome(targetArg);

if (!fs.existsSync(resolved)) {
  console.error(`\x1b[31mError:\x1b[0m File not found: ${resolved}`);
  process.exit(1);
}

console.log(`\x1b[32m✔\x1b[0m Inspecting target: \x1b[36m${resolved}\x1b[0m`);
console.log(`⚡ Launching Isar Viewer with realtime live watch...`);

const openUrl = `/?path=${encodeURIComponent(resolved)}`;
const vite = spawn('npx', ['vite', '--open', openUrl], {
  stdio: 'inherit',
  shell: true,
});

vite.on('exit', (code) => {
  process.exit(code ?? 0);
});
