// Copies the QR reader's WebAssembly module (zxing-wasm, used by barcode-detector when the
// browser has no BarcodeDetector of its own, as Chrome on Windows) into public/, so the web
// version serves it itself. Without this, the reader downloads it from a CDN on the Internet.
// The copy matches the installed version; it is not committed (see .gitignore).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const client = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(client, 'package.json'));
// zxing-wasm is a dependency of barcode-detector: resolve it from there.
const fromDetector = createRequire(require.resolve('barcode-detector'));
const reader = fromDetector.resolve('zxing-wasm/reader');
const packageRoot = reader.slice(0, reader.lastIndexOf('zxing-wasm') + 'zxing-wasm'.length);
const wasm = join(packageRoot, 'dist', 'reader', 'zxing_reader.wasm');
mkdirSync(join(client, 'public'), { recursive: true });
copyFileSync(wasm, join(client, 'public', 'zxing_reader.wasm'));
console.log(`zxing_reader.wasm copied from ${wasm}`);
