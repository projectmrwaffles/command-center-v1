import { pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = process.cwd();

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('@/')) {
    const targetPath = path.join(projectRoot, 'src', specifier.slice(2));
    const resolvedPath = path.extname(targetPath) ? targetPath : `${targetPath}.ts`;
    return defaultResolve(pathToFileURL(resolvedPath).href, context, defaultResolve);
  }

  return defaultResolve(specifier, context, defaultResolve);
}
