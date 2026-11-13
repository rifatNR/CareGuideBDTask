import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import packageJson from '../package.json' with { type: 'json' };

const outputDirectory = new URL('../backend-dist/', import.meta.url);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    outfile: new URL('index.js', outputDirectory).pathname,
});

const runtimeDependencies = ['bcryptjs', 'dotenv', 'express', 'jsonwebtoken', 'mongoose', 'zod'];
const backendPackage = {
    name: 'secure-notes-api',
    private: true,
    type: 'module',
    scripts: { start: 'node index.js' },
    dependencies: Object.fromEntries(
        runtimeDependencies.map((name) => [name, packageJson.dependencies[name]]),
    ),
};

await writeFile(
    new URL('package.json', outputDirectory),
    `${JSON.stringify(backendPackage, null, 4)}\n`,
);
console.log('Backend bundle created in backend-dist/.');
