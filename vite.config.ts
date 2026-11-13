import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { isarInspectPlugin } from './vite-plugin-isar-inspect';

export default defineConfig({
  plugins: [react(), tailwindcss(), isarInspectPlugin()],
});
