import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function sitesMetadata(): Plugin {
  return {
    name: 'daggerheart-sites-metadata',
    apply: 'build',
    async closeBundle() {
      const target = resolve('dist/.openai');
      await rm(target, { recursive: true, force: true });
      await mkdir(target, { recursive: true });
      await cp(resolve('.openai/hosting.json'), resolve(target, 'hosting.json'));
    }
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [sitesMetadata()],
  build: {
    emptyOutDir: false,
    outDir: 'dist/server',
    lib: {
      entry: resolve('worker/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
