import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repack existing authored drawings; never regenerate or articulate Bob's body.
// Usage: node tools/build-companion-bob-art.mjs --game-root <Idle Times checkout>
// sharp is resolved from that checkout, so OIP needs no new image dependency.
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const gameArg = option('--game-root');
if (!gameArg || gameArg.startsWith('--')) throw new Error('Pass --game-root <Idle Times checkout>.');
const gameRoot = resolve(gameArg);
const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(option('--out') || resolve(siteRoot, 'static/companion-bob'));
const gameRequire = createRequire(resolve(gameRoot, 'package.json'));
const sharp = gameRequire('sharp');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const cell = 160;
const foot = [80, 148];
const sourceRoot = 'prototypes/hd2d-newsroom/assets';
const definitions = [
  { name: 'neutral', family: 'pet-attention', file: 'bob-attention.webp', frame: 0, role: 'neutral', scale: 112 / 120 },
  { name: 'blink-closed', family: 'pet-attention', file: 'bob-attention.webp', frame: 1, role: 'blink-closed', scale: 112 / 120 },
  { name: 'blink-half', family: 'pet-attention', file: 'bob-attention.webp', frame: 2, role: 'blink-half', scale: 112 / 120 },
  { name: 'friendly-settle', family: 'pet-attention', file: 'bob-attention.webp', frame: 3, role: 'friendly-settle', scale: 112 / 120 },
  { name: 'wave', family: 'pet-pen', file: 'bob-pen.webp', frame: 11, role: 'wave', scale: 1 },
];
const sources = new Map();
const frames = [];
for (const definition of definitions) {
  const sourcePath = `${sourceRoot}/${definition.family}/${definition.file}`;
  const metadataPath = `${sourceRoot}/${definition.family}/manifest.json`;
  const source = await readFile(resolve(gameRoot, sourcePath));
  const metadataBytes = await readFile(resolve(gameRoot, metadataPath));
  const metadata = JSON.parse(metadataBytes);
  const authored = metadata.frames[definition.frame];
  if (authored?.role !== definition.role || !authored.footAnchor || metadata.frame.some(value => value !== cell)) {
    throw new Error(`Unexpected source frame: ${sourcePath} frame ${definition.frame}.`);
  }
  const size = Math.round(cell * definition.scale);
  const scale = size / cell;
  const drawing = await sharp(source).extract({
    left: definition.frame % metadata.grid[0] * cell,
    top: Math.floor(definition.frame / metadata.grid[0]) * cell,
    width: cell, height: cell,
  }).resize(size, size, { kernel: 'nearest' }).png().toBuffer();
  const left = Math.round(foot[0] - authored.footAnchor[0] * scale);
  const top = Math.round(foot[1] - authored.footAnchor[1] * scale);
  if (left < 0 || top < 0 || left + size > cell || top + size > cell) throw new Error('Registered drawing would clip.');
  const pixels = await sharp({ create: { width: cell, height: cell, channels: 4, background: '#00000000' } })
    .composite([{ input: drawing, left, top }]).png().toBuffer();
  frames.push({ pixels, name: definition.name, sourcePath, sourceFrame: definition.frame, scale, offset: [left, top] });
  sources.set(sourcePath, { path: sourcePath, sha256: hash(source), metadataPath, metadataSha256: hash(metadataBytes) });
}
const atlas = await sharp({ create: { width: cell * frames.length, height: cell, channels: 4, background: '#00000000' } })
  .composite(frames.map((frame, index) => ({ input: frame.pixels, left: index * cell, top: 0 })))
  .webp({ lossless: true, effort: 6 }).toBuffer();
const fallback = await sharp(frames[0].pixels).webp({ lossless: true, effort: 6 }).toBuffer();
const sourceCommit = execFileSync('git', ['-C', gameRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifest = {
  schema: 'oip-companion-bob-art/v1', sourceCommit, sharpVersion: sharp.versions.sharp,
  processing: 'Existing transparent whole-body drawings, nearest-neighbor common family scale, shared boot registration, lossless WebP. Wave is one authored held pose, not a synthesized multi-frame wave.',
  cell: [cell, cell], columns: frames.length, footAnchor: foot,
  sources: [...sources.values()],
  frames: frames.map(({ pixels, ...frame }, index) => ({ index, ...frame })),
  outputs: [
    { path: 'atlas.webp', bytes: atlas.length, sha256: hash(atlas), width: cell * frames.length, height: cell },
    { path: 'idle.webp', bytes: fallback.length, sha256: hash(fallback), width: cell, height: cell },
  ],
};
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'atlas.webp'), atlas);
await writeFile(resolve(output, 'idle.webp'), fallback);
await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, sourceCommit, files: manifest.outputs }));
