import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const read = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const catalog = read('data/music.json');
const playlist = read('static/companion-bob/runtime/music/playlist.json');
const runtime = path.resolve('static/companion-bob/runtime');
const legacyIds = ['first-edition', 'fresh-black', 'wire-service', 'sunrise-headlines', 'city-awakens', 'confidential-sources', 'editorial-meeting', 'hot-off-the-press'];
const sansTitles = ['Chairman', 'Inkwell', 'Late Nights at the Office', 'Blue Skies, Aren’t They?', 'Feather Quill', 'Round', 'Deep Research'];
const sansSeconds = [184.8, 199.2, 141.6, 174.8, 177.2, 162.24, 154.8];
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

test('Music retains approved album order, exact package metadata, and legacy saved selections', () => {
  assert.equal(catalog.version, 1);
  assert.equal(playlist.version, 1);
  assert.equal(catalog.defaultTrackId, 'sans-serif-chairman');
  assert.equal(playlist.defaultTrackId, catalog.defaultTrackId);
  assert.deepEqual(catalog.albums.map(a => a.id), ['sans-serif', 'the-fine-print-vol-1']);
  assert.deepEqual(catalog.albums.map(a => a.displayOrder), [1, 2]);
  assert.deepEqual(catalog.albums[0].tracks.map(t => t.title), sansTitles);
  assert.deepEqual(catalog.albums[0].tracks.map(t => t.duration), sansSeconds);
  assert.deepEqual(catalog.albums[1].tracks.map(t => t.id), legacyIds);
  for (const album of catalog.albums) {
    assert.equal(album.artist, 'Robby V and The Paperboys');
    assert.ok(album.cover, `${album.title} has its approved cover`);
    for (const track of album.tracks) assert.equal(track.artist, album.artist);
  }
  assert.deepEqual(playlist.tracks.slice(7).map(t => t.src), legacyIds.map(id => `music/tracks/${id}.mp3`));
});

test('Generated runtime metadata has exactly the source album memberships and safe existing media', () => {
  assert.equal(playlist.tracks.length, 15);
  assert.equal(new Set(playlist.tracks.map(t => t.id)).size, 15);
  assert.equal(playlist.albums.length, catalog.albums.length);
  for (const album of catalog.albums) {
    const generated = playlist.albums.find(a => a.id === album.id);
    assert.deepEqual(generated.trackIds, album.tracks.map(t => t.id));
    assert.equal(generated.title, album.title);
    assert.equal(generated.artist, album.artist);
    for (const original of album.tracks) {
      const track = playlist.tracks.find(t => t.id === original.id);
      assert.deepEqual(track, {
        id: original.id, title: original.title, artist: original.artist,
        duration: original.duration, album: album.title, albumId: album.id,
        src: original.src, ...(album.cover ? { artwork: album.cover.src } : {}),
      });
    }
  }
  const paths = new Set(playlist.tracks.map(t => t.src));
  for (const album of playlist.albums) {
    if (album.artwork) paths.add(album.artwork);
    for (const art of album.artworks || []) paths.add(art.src);
  }
  for (const media of paths) {
    assert.match(media, /^music\/[a-zA-Z0-9_/-]+\.(mp3|webp)$/);
    const resolved = path.resolve(runtime, media);
    assert.ok(resolved.startsWith(runtime + path.sep));
    assert.ok(fs.statSync(resolved).size > 0);
  }
  assert.doesNotMatch(JSON.stringify(playlist), /(?:[A-Z]:\\|sourceSha256|sourceWorkingTree|assets\/music)/, 'Public runtime metadata omits source/private paths');
});

test('Imported Sans Serif tracks match the owner-approved package byte hashes', () => {
  const approvedHashes = [
    '0019f1acecc49e56ad587207589a997a0ac5f2ec865a5d209e4e02c79b946a96',
    '7b81267743421ebc7eadd6f013a7aa9e63b8108a503af2bb8ea6657f2de17594',
    '0f03fad8cadb1bb3b995bca8352efde2c0fc7cce4f2e37912790cfef0327357a',
    '8059b3e04705e5cd9590df70f44629833da4fa1a99798ebe4e8e5898f5a1fe26',
    '4cd59dc6342d6fefc6679bb426b1499ba4910bcbc64064a0a81ad01ec71fe0e1',
    'c7f596c6d7c6767c33b768d7628df97702fdaed1b68a5d74dcb1c5594d63f031',
    '03218ea94bcc6d5b58562b182497ab53eb89e5d6ff58ac270d0fa89f5627d560',
  ];
  catalog.albums[0].tracks.forEach((track, i) => {
    const bytes = fs.readFileSync(path.join(runtime, track.src));
    assert.equal(bytes.length, track.bytes);
    assert.equal(sha(bytes), approvedHashes[i]);
    assert.equal(track.sha256, approvedHashes[i]);
  });
});

function webpDimensions(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + length <= bytes.length);
    if (kind === 'VP8X') return [1 + bytes.readUIntLE(start + 4, 3), 1 + bytes.readUIntLE(start + 7, 3)];
    if (kind === 'VP8 ') return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    if (kind === 'VP8L') {
      const packed = bytes.readUInt32LE(start + 1);
      return [1 + (packed & 0x3fff), 1 + ((packed >>> 14) & 0x3fff)];
    }
    offset = start + length + (length & 1);
  }
  assert.fail('WebP has no image dimensions');
}

test('Approved covers stay nonpublic; bounded WebP derivatives preserve both square compositions', () => {
  assert.equal(sha(fs.readFileSync('assets/music/sans-serif/cover.png')), 'a0eeb19228f869666ce8d5c00ac5cc7a7fc464eee7956b622c16de6f06b8e908', 'The original Sans Serif approval remains preserved');
  assert.equal(sha(fs.readFileSync('assets/music/the-fine-print-vol-1/cover.png')), 'c5d4ef984308dc1406828db188506d7254f62bbedbb0777243ac41151dda2b71', 'The original Fine Print approval remains preserved');
  for (const album of catalog.albums) {
    const cover = album.cover;
    assert.match(cover.source, /^assets\/music\/[a-z0-9-]+\/[a-z0-9-]+\.png$/);
    const source = path.resolve(cover.source);
    assert.ok(source.startsWith(path.resolve('assets/music') + path.sep));
    const original = fs.readFileSync(source);
    assert.equal(original.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(original.length > 0 && original.length < 16 * 1024 * 1024);
    const width = original.readUInt32BE(16), height = original.readUInt32BE(20);
    assert.ok(width >= 960 && width <= 4096);
    assert.equal(width, height);
    assert.equal(cover.sourceSha256, sha(original));
    assert.ok(cover.revision && cover.alt);
    assert.deepEqual(cover.variants.map(a => a.width), [320, 640, 960]);
    assert.equal(cover.src, cover.variants[1].src);
    assert.equal(cover.width, 640);
    assert.equal(cover.height, 640);
    assert.ok(!fs.existsSync(path.join(runtime, path.basename(cover.source))), 'Original is not copied to the public runtime');
    for (const art of cover.variants) {
      assert.match(art.src, /^music\/artwork\/[a-z0-9-]+\.webp$/);
      const bytes = fs.readFileSync(path.join(runtime, art.src));
      assert.ok(bytes.length > 0 && bytes.length < 1024 * 1024);
      assert.deepEqual(webpDimensions(bytes), [art.width, art.height]);
      assert.equal(art.width, art.height);
    }
  }
});

test('Runtime build manifest binds the catalog, playlist and covers without exposing originals', () => {
  const manifest = read('static/companion-bob/runtime/build-manifest.json');
  assert.equal(manifest.musicCatalogSource.sha256, sha(Buffer.from(fs.readFileSync('data/music.json', 'utf8').replace(/\r\n?/g, '\n'))));
  const records = new Map(manifest.files.map(record => [record.path, record]));
  assert.equal(records.size, manifest.files.length);
  assert.equal(manifest.totalBytes, manifest.files.reduce((sum, record) => sum + record.bytes, 0));
  const changed = new Set(['music/playlist.json', ...catalog.albums.flatMap(album => album.cover.variants.map(art => art.src))]);
  for (const relative of changed) {
    const bytes = fs.readFileSync(path.join(runtime, relative));
    assert.deepEqual(records.get(relative), { path: relative, bytes: bytes.length, sha256: sha(bytes) });
  }
  for (const album of catalog.albums) assert.ok(!records.has(album.cover.source));
});

test('Catalog refresh preserves runtime provenance and unchanged audio; check is read-only and portable', () => {
  const script = String.raw`
import copy, importlib.util, json, sys, tempfile
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('music_catalog', 'scripts/generate_music_catalog.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as temporary:
    m.ROOT = Path(temporary)
    m.RUNTIME = m.ROOT / 'runtime'
    m.OUTPUT = m.RUNTIME / 'music/playlist.json'
    m.CATALOG = m.ROOT / 'data/music.json'
    m.BUILD_MANIFEST = m.RUNTIME / 'build-manifest.json'
    initial = {'runtime.js': b'unchanged compiled runtime', 'music/tracks/legacy.mp3': b'verified audio', 'music/artwork/cover.webp': b'old art', 'music/playlist.json': b'old playlist'}
    records = []
    for relative, payload in initial.items():
        target = m.RUNTIME / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        records.append({'path': relative, 'bytes': len(payload), 'sha256': m.digest(payload)})
    previous = {'version': 1, 'gameSourceCommit': 'a' * 40, 'sourceWorkingTree': False,
        'sources': [{'path': 'src/music/controller.ts', 'sha256': 'b' * 64}], 'protocol': 'preserve-this',
        'musicCatalogSource': {'repository': 'LPeasy/outsideinprint', 'path': 'data/music.json', 'sha256': 'c' * 64},
        'totalBytes': sum(r['bytes'] for r in records), 'files': records}
    catalog = {'version': 1, 'station': 'JukeBob', 'defaultTrackId': 'legacy', 'albums': [
        {'id': 'album', 'title': 'Album', 'artist': 'Updated artist', 'displayOrder': 1,
         'cover': {'src': 'music/artwork/cover.webp', 'variants': [{'src': 'music/artwork/cover.webp', 'width': 640, 'height': 640}]},
         'tracks': [{'id': 'legacy', 'title': 'Legacy', 'artist': 'Updated artist', 'number': 1, 'duration': 1, 'src': 'music/tracks/legacy.mp3'}]}]}
    m.CATALOG.parent.mkdir()
    text = json.dumps(catalog, indent=2) + '\n'
    m.CATALOG.write_text(text, encoding='utf-8', newline='\n')
    m.BUILD_MANIFEST.write_text(json.dumps(previous), encoding='utf-8')
    (m.RUNTIME / 'music/artwork/cover.webp').write_bytes(b'updated cover bytes')
    before = copy.deepcopy(previous)
    read_bytes = Path.read_bytes
    def guarded_read(target):
        assert target.suffix != '.mp3', 'Unchanged audio must not be rehashed'
        return read_bytes(target)
    with patch.object(Path, 'read_bytes', guarded_read):
        with patch.object(sys, 'argv', ['generator', '--check']):
            try: m.main()
            except SystemExit as failure: assert 'stale' in str(failure)
            else: raise AssertionError('Check accepted stale playlist/art/catalog bindings')
        assert json.loads(m.BUILD_MANIFEST.read_text()) == before
        assert m.OUTPUT.read_bytes() == initial['music/playlist.json']
        with patch.object(sys, 'argv', ['generator']): m.main()
        updated = json.loads(m.BUILD_MANIFEST.read_text())
        for key in previous.keys() - {'files', 'totalBytes', 'musicCatalogSource'}:
            assert updated[key] == previous[key], key
        for relative in ('runtime.js', 'music/tracks/legacy.mp3'):
            assert next(r for r in updated['files'] if r['path'] == relative) == next(r for r in records if r['path'] == relative)
        assert previous == before
        assert updated['musicCatalogSource']['sha256'] == m.digest(text.encode('utf-8'))
        assert updated['totalBytes'] == sum(r['bytes'] for r in updated['files'])
        saved = m.BUILD_MANIFEST.read_bytes()
        m.CATALOG.write_bytes(text.replace('\n', '\r\n').encode('utf-8'))
        with patch.object(sys, 'argv', ['generator', '--check']): m.main()
        assert m.BUILD_MANIFEST.read_bytes() == saved
        (m.RUNTIME / 'runtime.js').write_bytes(b'changed runtime length')
        try: m.refresh_build_manifest(updated, catalog, text, m.OUTPUT.read_bytes())
        except ValueError as failure: assert 'export the runtime' in str(failure)
        else: raise AssertionError('Music refresh blessed a changed runtime asset')
print('Catalog refresh fixture passed')
`;
  const command = process.env.OIP_PYTHON_EXECUTABLE || (process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
    : 'python3');
  const args = !process.env.OIP_PYTHON_EXECUTABLE && process.platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('tools/bin/invoke-tool.ps1'), '-ToolName', 'python', '-WrapperName', 'python', '-']
    : ['-'];
  const result = execFileSync(command, args, { input: script, encoding: 'utf8', timeout: 30_000 });
  assert.match(result, /Catalog refresh fixture passed/);
});
