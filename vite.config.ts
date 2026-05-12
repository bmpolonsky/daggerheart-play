import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [preact(), tailwindcss()],
  resolve: {
    alias: {
      '@cards': resolve(workspaceRoot, 'src/tools/card-creator'),
      '@combat': resolve(workspaceRoot, 'src/tools/combat-builder'),
      'react/jsx-runtime': 'preact/compat/jsx-runtime',
      'react/jsx-dev-runtime': 'preact/compat/jsx-dev-runtime',
      react: 'preact/compat',
      'react-dom/client': 'preact/compat/client',
      'react-dom': 'preact/compat'
    }
  }
});
