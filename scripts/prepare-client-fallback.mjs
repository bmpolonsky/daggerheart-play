import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = process.env.VITE_SESSION_MODE === 'server' ? resolve('dist/client') : resolve('dist');
await copyFile(resolve(outputDirectory, 'index.html'), resolve(outputDirectory, '404.html'));
