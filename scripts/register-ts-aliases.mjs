import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) return null;

  const relativePath = specifier.slice(2);
  const candidates = [
    resolve(rootDir, 'src', `${relativePath}.ts`),
    resolve(rootDir, 'src', `${relativePath}.tsx`),
    resolve(rootDir, 'src', relativePath, 'index.ts'),
    resolve(rootDir, 'src', relativePath, 'index.tsx'),
  ];

  const match = candidates.find((candidate) => existsSync(candidate));
  return match ? pathToFileURL(match).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const aliasUrl = resolveAlias(specifier);
    if (aliasUrl) {
      return nextResolve(aliasUrl, context);
    }

    return nextResolve(specifier, context);
  },
});
