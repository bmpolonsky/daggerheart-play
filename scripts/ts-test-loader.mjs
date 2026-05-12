import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const parentPath = context.parentURL?.startsWith('file:') ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    const basePath = specifier.startsWith('/') ? specifier : resolvePath(parentPath, specifier);
    const candidates = extname(basePath) ? [basePath] : [`${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, `${basePath}.mjs`];

    for (const candidate of candidates) {
      try {
        await readFile(candidate);
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      } catch {
        // Try the next extension.
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && (url.endsWith('.ts') || url.endsWith('.tsx'))) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true
      },
      fileName: fileURLToPath(url)
    });
    return { format: 'module', source: transpiled.outputText, shortCircuit: true };
  }

  return nextLoad(url, context);
}
