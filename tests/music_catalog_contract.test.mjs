import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
  assert.equal(catalog.albums[0].artist, 'Robby V and the Paperboys');
  assert.deepEqual(catalog.albums[1].tracks.map(t => t.id), legacyIds);
  assert.equal(catalog.albums[1].artist, 'Robby V and the Paper Boys');
  assert.equal(catalog.albums[1].cover, undefined, 'Do not invent Fine Print artwork');
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

test('Approved cover stays nonpublic; bounded WebP derivatives preserve the square composition', () => {
  const cover = catalog.albums[0].cover;
  const original = fs.readFileSync(path.resolve(cover.source));
  assert.equal(sha(original), 'a0eeb19228f869666ce8d5c00ac5cc7a7fc464eee7956b622c16de6f06b8e908');
  assert.equal(cover.sourceSha256, sha(original));
  assert.equal(cover.revision, 'v2-oip-house-style');
  assert.deepEqual(cover.variants.map(a => a.width), [320, 640, 960]);
  assert.match(cover.source, /^assets\/music\//);
  for (const art of cover.variants) {
    const bytes = fs.readFileSync(path.join(runtime, art.src));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(bytes.length < 1024 * 1024);
    assert.equal(art.width, art.height);
  }
});
