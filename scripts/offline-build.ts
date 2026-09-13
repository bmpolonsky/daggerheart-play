import type { Plugin } from 'vite';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Artwork is a separate, optional download; its small manifest belongs to the shell.
export function offlineBuild(): Plugin {
  let publicDir: string;
  return {
    name: 'offline-manifest',
    apply: 'build',
    configResolved(config) { publicDir = config.publicDir; },
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
      const artwork = await readdir(resolve(publicDir, 'image'), { recursive: true, withFileTypes: true });
      const files = artwork.filter((file) => file.isFile() && /\.(?:webp|png|jpe?g|gif|svg|avif)$/i.test(file.name))
        .map((file) => resolve(file.parentPath, file.name).slice(publicDir.length + 1)).sort();
      const sizes = await Promise.all(files.map(async (path) => (await stat(resolve(publicDir, path))).size));
      this.emitFile({ type: 'asset', fileName: 'offline-artwork.json', source: JSON.stringify({ files, bytes: sizes.reduce((sum, size) => sum + size, 0) }) });
      this.emitFile({ type: 'asset', fileName: 'offline-manifest.json', source: JSON.stringify([...new Set(resources)].sort()) });
    }
  };
}
