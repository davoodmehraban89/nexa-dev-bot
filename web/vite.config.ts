import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/studio/',
  build: {
    outDir: 'dist/studio',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          editor: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/search',
            '@codemirror/lang-javascript',
            '@codemirror/lang-json',
            '@codemirror/lang-css',
            '@codemirror/lang-html'
          ]
        }
      }
    }
  },
  server: {
    host: '127.0.0.1'
  }
});
