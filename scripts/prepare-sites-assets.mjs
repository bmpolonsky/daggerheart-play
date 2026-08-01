import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = process.argv.includes('--clean') ? resolve('dist') : resolve('dist/client/image');
await rm(target, { recursive: true, force: true });
