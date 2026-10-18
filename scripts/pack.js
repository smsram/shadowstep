import fs from 'fs';
import path from 'path';
import * as archiverModule from 'archiver';

const homeDir = process.env.USERPROFILE || process.env.HOME || '.';
const outDir = path.resolve(homeDir, 'Downloads');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const zipPath = path.join(outDir, 'shadowstep.zip');
const output = fs.createWriteStream(zipPath);

// Support both archiver v8 (ZipArchive class) and v7/v6 (default factory function)
function getArchiveInstance(options) {
  if (typeof archiverModule.ZipArchive === 'function') {
    return new archiverModule.ZipArchive(options);
  }
  if (typeof archiverModule.default === 'function') {
    return archiverModule.default('zip', options);
  }
  if (typeof archiverModule === 'function') {
    return archiverModule('zip', options);
  }
  throw new Error('Unable to initialize archiver zip engine');
}

const archive = getArchiveInstance({ zlib: { level: 9 } });

output.on('close', () => {
  console.log(`[ShadowStep] Successfully packed ${archive.pointer()} total bytes to: ${zipPath}`);
});

archive.on('error', (err) => {
  console.error('[ShadowStep] Packaging error:', err);
  throw err;
});

archive.pipe(output);

// Append all files strictly from dist/ root, explicitly excluding .vite internal manifest
archive.glob('**/*', {
  cwd: 'dist',
  ignore: ['.vite/**', '.vite']
});

archive.finalize();
