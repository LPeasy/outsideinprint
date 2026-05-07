import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const masthead = fs.readFileSync(path.resolve("layouts/partials/masthead.html"), "utf8");
const baseLayout = fs.readFileSync(path.resolve("layouts/_default/baseof.html"), "utf8");
const paperRoutePartial = fs.readFileSync(path.resolve("layouts/partials/paper_route.html"), "utf8");
const launcher = fs.readFileSync(path.resolve("assets/js/paper-route-launcher.js"), "utf8");
const rules = fs.readFileSync(path.resolve("assets/js/paper-route-rules.js"), "utf8");
const game = fs.readFileSync(path.resolve("assets/js/paper-route.js"), "utf8");
const css = fs.readFileSync(path.resolve("assets/css/main.css"), "utf8");
const config = fs.readFileSync(path.resolve("hugo.toml"), "utf8");
const vendorReadme = fs.readFileSync(path.resolve("assets/vendor/phaser/README.md"), "utf8");
const vendorLicense = fs.readFileSync(path.resolve("assets/vendor/phaser/LICENSE.txt"), "utf8");
const spriteMap = JSON.parse(fs.readFileSync(path.resolve("assets/images/paper-route/sprites/sprite-map.json"), "utf8"));
const spriteBaseDirectory = path.resolve(spriteMap.baseDirectory || "assets/images/paper-route/sprites");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngMetadata(filePath) {
  const png = fs.readFileSync(filePath);

  assert.equal(png.subarray(0, 8).compare(pngSignature), 0, `${filePath} must be a PNG`);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    fileSizeBytes: png.length
  };
}

test("Paper-Bob launcher stays homepage-only and outside primary navigation", () => {
  assert.match(config, /\[params\.paper_route\][\s\S]*enabled = true/);
  assert.match(masthead, /\$paperRouteEnabled := and \$isHomeMasthead/);
  assert.match(masthead, /resources\.Get "images\/paper-route\/paper-bob-logo\.png"/);
  assert.match(masthead, /data-paper-route-launch/);
  assert.match(masthead, /aria-haspopup="dialog"/);
  assert.match(masthead, /aria-controls="paper-route-arcade"/);
  assert.match(masthead, /Launch Paper-Bob arcade/);
  assert.match(masthead, /paper-route-toggle__logo/);
  assert.doesNotMatch(masthead, /paper-route-toggle__mark/);
  assert.doesNotMatch(masthead, /Paper\s+Route/);
  assert.doesNotMatch(
    masthead.match(/<nav class="nav nav--section-rail"[\s\S]*?<\/nav>/)?.[0] || "",
    /paper-route/i
  );
  assert.match(baseLayout, /partial "paper_route\.html"/);
});

test("Paper-Bob partial lazy-loads pinned same-origin Phaser and runtime assets", () => {
  assert.match(paperRoutePartial, /\$enabled := and \.IsHome/);
  assert.match(paperRoutePartial, /resources\.Get "vendor\/phaser\/phaser-3\.90\.0-arcade-physics\.min\.js" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "js\/paper-route-rules\.js" \| resources\.Minify \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "js\/paper-route\.js" \| resources\.Minify \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "js\/paper-route-launcher\.js" \| resources\.Minify \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-sprite\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-sprite-sheet\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/sprites\/paper\/paper-projectile-default\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/sprites\/route\/route-puddle\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /data-paper-route-phaser-src="\{\{ \$phaser\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-rules-src="\{\{ \$rules\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-game-src="\{\{ \$game\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-bob-src="\{\{ \$bobSprite\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-bob-sheet-src="\{\{ \$bobSpriteSheet\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-paper-src="\{\{ \$paperProjectile\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-puddle-src="\{\{ \$routePuddle\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-puddle-splash-src="\{\{ \$puddleSplash\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-mailbox-hit-src="\{\{ \$mailboxHit\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-doorstep-hit-src="\{\{ \$doorstepHit\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-window-hit-src="\{\{ \$windowHit\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-papers/);
  assert.match(paperRoutePartial, /data-paper-route-mute/);
  assert.match(paperRoutePartial, /data-paper-route-pause-card/);
  assert.match(paperRoutePartial, /data-paper-route-failure/);
  assert.match(paperRoutePartial, /data-paper-route-retry/);
  assert.match(paperRoutePartial, /data-paper-route-touch/);
  assert.match(paperRoutePartial, /data-paper-route-close[\s\S]*tabindex="-1"/);
  assert.match(paperRoutePartial, /<h2 id="paper-route-title">Paper-Bob<\/h2>/);
  assert.doesNotMatch(paperRoutePartial, /Paper\s+Route/);
  assert.match(paperRoutePartial, /<script defer src="\{\{ \$launcher\.RelPermalink \}\}"/);
  assert.doesNotMatch(paperRoutePartial, /<script[^>]+phaser-3\.90\.0-arcade-physics/);
  assert.match(vendorReadme, /Phaser 3\.90\.0 Arcade Physics/);
  assert.match(vendorReadme, /MIT License/);
  assert.match(vendorLicense, /Copyright \(c\) Photon Storm Ltd\./);
  assert.match(vendorLicense, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test("Paper-Bob cropped sprite manifest entries point to real PNG files with metadata", () => {
  const croppedEntries = spriteMap.entries.filter((entry) => entry.sourceStatus === "cropped");

  assert.equal(croppedEntries.length > 0, true);
  for (const entry of croppedEntries) {
    assert.equal(typeof entry.file, "string", `${entry.id} must declare a file`);
    assert.notEqual(entry.file, "", `${entry.id} must declare a non-empty file`);

    const filePath = path.join(spriteBaseDirectory, entry.file);
    assert.equal(fs.existsSync(filePath), true, `${entry.id} missing ${entry.file}`);

    const metadata = readPngMetadata(filePath);
    assert.equal(metadata.width > 0, true, `${entry.id} width must be positive`);
    assert.equal(metadata.height > 0, true, `${entry.id} height must be positive`);
    assert.equal(metadata.fileSizeBytes > 0, true, `${entry.id} file size must be positive`);
    assert.equal(entry.width, metadata.width, `${entry.id} manifest width must match the PNG`);
    assert.equal(entry.height, metadata.height, `${entry.id} manifest height must match the PNG`);
    assert.equal(entry.fileSizeBytes, metadata.fileSizeBytes, `${entry.id} manifest file size must match the PNG`);
  }
});

test("Paper-Bob launcher loads heavy scripts only after user activation", () => {
  assert.match(launcher, /querySelector\("\[data-paper-route-launch\]"\)/);
  assert.match(launcher, /document\.createElement\("script"\)/);
  assert.match(launcher, /data-paper-route-phaser-src/);
  assert.match(launcher, /data-paper-route-rules-src/);
  assert.match(launcher, /data-paper-route-game-src/);
  assert.match(launcher, /data-paper-route-bob-src/);
  assert.match(launcher, /data-paper-route-bob-sheet-src/);
  assert.match(launcher, /data-paper-route-puddle-splash-src/);
  assert.match(launcher, /window\.Phaser/);
  assert.match(launcher, /window\.OipPaperRouteRules/);
  assert.match(launcher, /window\.OipPaperRouteGame/);
  assert.match(launcher, /bobSrc: bobSrc/);
  assert.match(launcher, /bobSheetSrc: bobSheetSrc/);
  assert.match(launcher, /paperSrc: paperSrc/);
  assert.match(launcher, /paper-route-open/);
  assert.match(launcher, /aria-busy/);
  assert.match(launcher, /runtimePromise = null/);
  assert.match(launcher, /event\.key === "Escape"/);
  assert.match(launcher, /closest\("\[hidden\]"\)/);
  assert.match(launcher, /element\.tabIndex >= 0/);
  assert.match(launcher, /getClientRects\(\)\.length > 0/);
  assert.match(launcher, /!overlay\.contains\(document\.activeElement\)/);
  assert.match(launcher, /focusable\.indexOf\(document\.activeElement\) === -1/);
  assert.match(launcher, /activeTrigger\.focus/);
  assert.doesNotMatch(launcher, /setGameControls\(true\)/);
  assert.doesNotMatch(launcher, /https?:\/\//);
});

test("Paper-Bob V2 rules own scoring, papers, timer, and trick state", () => {
  assert.match(rules, /STARTING_PAPERS = 30/);
  assert.match(rules, /RUN_SECONDS = 75/);
  assert.match(rules, /mailbox: 100/);
  assert.match(rules, /doorstep: 150/);
  assert.match(rules, /window: 250/);
  assert.match(rules, /airborneDelivery: 75/);
  assert.match(rules, /puddleClear: 75/);
  assert.match(rules, /RouteRules\.prototype\.throwLeft/);
  assert.match(rules, /RouteRules\.prototype\.throwRight/);
  assert.match(rules, /RouteRules\.prototype\.hitPuddle/);
  assert.match(rules, /RouteRules\.prototype\.takeRamp/);
  assert.match(rules, /RouteRules\.prototype\.startWheelie/);
  assert.match(rules, /root\.OipPaperRouteRules/);
});

test("Paper-Bob game uses Arcade Physics, V2 controls, and the approved storage key", () => {
  assert.match(game, /STORAGE_KEY = "oip-paper-route:v2"/);
  assert.match(game, /default: "arcade"/);
  assert.match(game, /scene\.load\.image\("paperBobSprite", this\.bobSrc\)/);
  assert.match(game, /scene\.load\.spritesheet\("paperBobSheet", this\.bobSheetSrc/);
  assert.match(game, /bobRunEnd/);
  assert.match(game, /setPlayerPose/);
  assert.match(game, /poseHoldUntil/);
  assert.match(game, /aspect-ratio:9 \/ 16|width: 480/);
  assert.match(game, /KeyCodes\.UP/);
  assert.match(game, /KeyCodes\.W/);
  assert.match(game, /KeyCodes\.Q/);
  assert.match(game, /KeyCodes\.E/);
  assert.match(game, /KeyCodes\.J/);
  assert.match(game, /KeyCodes\.L/);
  assert.match(game, /KeyCodes\.SPACE/);
  assert.match(game, /KeyCodes\.SHIFT/);
  assert.match(game, /data-paper-route-action/);
  assert.match(game, /function RouteAudio\(\)/);
  assert.match(game, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(game, /playSound\("throw"\)/);
  assert.match(game, /playSound\(type\)/);
  assert.match(game, /playSound\("ramp"\)/);
  assert.match(game, /playSound\("puddle"\)/);
  assert.match(game, /paperTrail/);
  assert.match(game, /targetBurst/);
  assert.match(game, /puddleBurst/);
  assert.match(game, /PaperRouteGame\.prototype\.showStartCard[\s\S]*pauseButton[\s\S]*disabled = true/);
  assert.match(game, /PaperRouteGame\.prototype\.showStartCard[\s\S]*restartButton[\s\S]*disabled = true/);
  assert.match(game, /PaperRouteGame\.prototype\.showStartCard[\s\S]*startButton\.focus/);
  assert.match(game, /setTouchPanel\(true\)/);
  assert.match(game, /window\.render_game_to_text/);
  assert.match(game, /scoreDelivery/);
  assert.match(game, /takeRamp/);
  assert.match(game, /hitPuddle/);
  assert.match(game, /writeHighScore/);
  assert.doesNotMatch(game, /localStorage\.setItem\((?!STORAGE_KEY)/);
  assert.doesNotMatch(game, /hitObstacle|spawnObstacle|paperRouteObstacle/);
});

test("Paper-Bob visual shell has balanced masthead and accessible overlay styles", () => {
  assert.match(css, /\.masthead-paper-route-toggle\{[\s\S]*left:max\(24px, env\(safe-area-inset-left\)\);/);
  assert.match(css, /\.masthead-theme-toggle\{[\s\S]*right:max\(24px, env\(safe-area-inset-right\)\);/);
  assert.match(css, /html\.theme-enabled \.paper-route-toggle\{[\s\S]*display:inline-flex;/);
  assert.match(css, /\.paper-route-toggle__logo\{[\s\S]*object-fit:contain;/);
  assert.match(css, /\.paper-route-overlay\{[\s\S]*position:fixed;[\s\S]*z-index:2000;/);
  assert.match(css, /body\.paper-route-open\{[\s\S]*overflow:hidden;/);
  assert.match(css, /\.paper-route-scorebar\{[\s\S]*grid-template-columns:repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.paper-route-stage\{[\s\S]*aspect-ratio:9 \/ 16;/);
  assert.match(css, /\.paper-route-cabinet-label/);
  assert.match(css, /\.paper-route-card--failure/);
  assert.match(css, /\.paper-route-dialog__button\[aria-pressed="true"\]/);
  assert.match(css, /\.paper-route-stage--paused \.paper-route-game/);
  assert.match(css, /@media \(hover:none\), \(pointer:coarse\)\{[\s\S]*\.paper-route-touch\{[\s\S]*display:grid;/);
  assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.paper-route-touch\{[\s\S]*display:grid;/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /html\[data-theme="light"\] \.paper-route-dialog/);
});
