import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url));
const appRelease = execSync('git rev-parse --short HEAD', { cwd: workspaceRoot, encoding: 'utf8' }).trim();

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  define: {
    __APP_RELEASE__: JSON.stringify(`daggerheart-play@${appRelease}`),
    __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN ?? '')
  },
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
