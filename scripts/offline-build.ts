import type { Plugin } from 'vite';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Artwork is a separate, optional download; its small manifest belongs to the shell.
export function offlineBuild(): Plugin {
  let publicDir: string;
  let base: string;
  return {
    name: 'offline-manifest',
    configResolved(config) { publicDir = config.publicDir; base = config.base; },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        if (path !== `${base}offline-manifest.json` && path !== `${base}offline-artwork.json`) return next();
        void (async () => {
          const manifest = path.endsWith('/offline-artwork.json')
            ? await artworkManifest(publicDir)
            : ['favicon.svg', ...await filesUnder(publicDir, 'font'), ...await filesUnder(publicDir, 'icon/dice')];
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(manifest));
        })().catch(next);
      });
    },
    async generateBundle(_options, bundle) {
      const resources = ['index.html', 'favicon.svg', 'offline-artwork.json'];
      for (const directory of ['data', 'font', 'icon/dice']) {
        const files = await readdir(resolve(publicDir, directory), { recursive: true, withFileTypes: true });
        for (const file of files) {
          if (file.isFile()) {
            const path = resolve(file.parentPath, file.name).slice(publicDir.length + 1);
            if (!path.endsWith('.md')) resources.push(path);
          }
        }
      }
      resources.push(...Object.keys(bundle).filter((path) => !path.endsWith('.map')));
      this.emitFile({ type: 'asset', fileName: 'offline-artwork.json', source: JSON.stringify(await artworkManifest(publicDir)) });
      this.emitFile({ type: 'asset', fileName: 'offline-manifest.json', source: JSON.stringify([...new Set(resources)].sort()) });
    }
  };
}

async function filesUnder(publicDir: string, directory: string): Promise<string[]> {
  const files = await readdir(resolve(publicDir, directory), { recursive: true, withFileTypes: true });
  return files.filter((file) => file.isFile()).map((file) => resolve(file.parentPath, file.name).slice(publicDir.length + 1)).sort();
}

async function artworkManifest(publicDir: string): Promise<{ files: string[]; bytes: number }> {
  const files = (await filesUnder(publicDir, 'image')).filter((path) => /\.(?:webp|png|jpe?g|gif|svg|avif)$/i.test(path));
  const sizes = await Promise.all(files.map(async (path) => (await stat(resolve(publicDir, path))).size));
  return { files, bytes: sizes.reduce((sum, size) => sum + size, 0) };
}
