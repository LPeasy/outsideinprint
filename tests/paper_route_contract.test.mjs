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
  assert.doesNotMatch(paperRoutePartial, /paper-route-plan\.js/);
  assert.match(paperRoutePartial, /resources\.Get "js\/paper-route\.js" \| resources\.Minify \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "js\/paper-route-launcher\.js" \| resources\.Minify \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-sprite\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-sprite-sheet\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-sprite-sheet\.webp" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/sprites\/paper\/paper-projectile-default\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/sprites\/paper\/paper-projectile-default\.webp" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/sprites\/route\/route-puddle\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/sprites\/route\/route-puddle\.webp" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-route-props-atlas\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-route-props-atlas\.webp" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-route-props-atlas\.json" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-lots-atlas\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-lots-atlas\.webp" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-lots-atlas\.json" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-track-atlas\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-track-atlas\.webp" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-track-atlas\.json" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-intro-atlas\.png" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-intro-atlas\.webp" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /resources\.Get "images\/paper-route\/paper-bob-intro-atlas\.json" \| resources\.Fingerprint/);
  assert.match(paperRoutePartial, /data-paper-route-phaser-src="\{\{ \$phaser\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-rules-src="\{\{ \$rules\.RelPermalink \}\}"/);
  assert.doesNotMatch(paperRoutePartial, /data-paper-route-plan-src/);
  assert.match(paperRoutePartial, /data-paper-route-game-src="\{\{ \$game\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-bob-src="\{\{ \$bobSprite\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-bob-sheet-src="\{\{ \$bobSpriteSheet\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-bob-sheet-webp-src="\{\{ \$bobSpriteSheetWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-paper-src="\{\{ \$paperProjectile\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-paper-webp-src="\{\{ \$paperProjectileWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-puddle-src="\{\{ \$routePuddle\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-puddle-webp-src="\{\{ \$routePuddleWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-puddle-splash-src="\{\{ \$puddleSplash\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-puddle-splash-webp-src="\{\{ \$puddleSplashWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-mailbox-hit-src="\{\{ \$mailboxHit\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-mailbox-hit-webp-src="\{\{ \$mailboxHitWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-doorstep-hit-src="\{\{ \$doorstepHit\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-doorstep-hit-webp-src="\{\{ \$doorstepHitWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-window-hit-src="\{\{ \$windowHit\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-window-hit-webp-src="\{\{ \$windowHitWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-props-atlas-src="\{\{ \$propsAtlas\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-props-atlas-webp-src="\{\{ \$propsAtlasWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-props-atlas-json-src="\{\{ \$propsAtlasJson\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-lots-atlas-src="\{\{ \$lotsAtlas\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-lots-atlas-webp-src="\{\{ \$lotsAtlasWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-lots-atlas-json-src="\{\{ \$lotsAtlasJson\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-track-atlas-src="\{\{ \$trackAtlas\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-track-atlas-webp-src="\{\{ \$trackAtlasWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-track-atlas-json-src="\{\{ \$trackAtlasJson\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-intro-atlas-src="\{\{ \$introAtlas\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-intro-atlas-webp-src="\{\{ \$introAtlasWebp\.RelPermalink \}\}"/);
  assert.match(paperRoutePartial, /data-paper-route-intro-atlas-json-src="\{\{ \$introAtlasJson\.RelPermalink \}\}"/);
  assert.doesNotMatch(paperRoutePartial, /data-paper-route-skip-intro/);
  assert.match(paperRoutePartial, /data-paper-route-intro-progress/);
  assert.match(paperRoutePartial, /data-paper-route-papers/);
  assert.match(paperRoutePartial, /data-paper-route-mute/);
  assert.match(paperRoutePartial, /data-paper-route-pause-card/);
  assert.match(paperRoutePartial, /data-paper-route-failure/);
  assert.match(paperRoutePartial, /data-paper-route-retry/);
  assert.match(paperRoutePartial, /data-paper-route-touch/);
  assert.match(paperRoutePartial, /data-paper-route-close[\s\S]*tabindex="-1"/);
  assert.match(paperRoutePartial, /class="paper-route-dialog" role="dialog" aria-modal="true" aria-labelledby="paper-route-title" tabindex="-1"/);
  assert.match(paperRoutePartial, /<h2 id="paper-route-title">Paper-Bob<\/h2>/);
  assert.match(paperRoutePartial, /Audio: On/);
  assert.match(paperRoutePartial, /Front-page delivery/);
  assert.match(paperRoutePartial, /Deliver the morning edition\./);
  assert.match(paperRoutePartial, /Thirty papers\. Seventy-five seconds\./);
  assert.match(paperRoutePartial, /data-paper-route-summary-metrics/);
  assert.match(paperRoutePartial, /Play again\?/);
  assert.match(paperRoutePartial, /paper-route-touch__pad/);
  assert.match(paperRoutePartial, /data-paper-route-dpad/);
  assert.match(paperRoutePartial, /paper-route-touch__actions/);
  assert.match(paperRoutePartial, /data-paper-route-action="steer-up"/);
  assert.match(paperRoutePartial, /data-paper-route-action="steer-left"/);
  assert.match(paperRoutePartial, /data-paper-route-action="steer-right"/);
  assert.match(paperRoutePartial, /data-paper-route-action="steer-down"/);
  assert.match(paperRoutePartial, /data-paper-route-action="throw-left"[\s\S]*>B<[\s\S]*Toss L/);
  assert.match(paperRoutePartial, /data-paper-route-action="throw-right"[\s\S]*>A<[\s\S]*Toss R/);
  assert.match(paperRoutePartial, /data-paper-route-action="jump"[\s\S]*>X<[\s\S]*Hop/);
  assert.match(paperRoutePartial, /data-paper-route-action="trick"[\s\S]*>Y<[\s\S]*Wheelie/);
  assert.match(paperRoutePartial, /Toss left: Q\/J/);
  assert.doesNotMatch(paperRoutePartial, /Paper\s+Route/);
  assert.doesNotMatch(paperRoutePartial, /Pedal the two-column route|Press hold|Run it again|Warming the presses/);
  assert.match(paperRoutePartial, /<script defer src="\{\{ \$launcher\.RelPermalink \}\}"/);
  assert.doesNotMatch(paperRoutePartial, /<script[^>]+phaser-3\.90\.0-arcade-physics/);
  assert.match(vendorReadme, /Phaser 3\.90\.0 Arcade Physics/);
  assert.match(vendorReadme, /MIT License/);
  assert.match(vendorLicense, /Copyright \(c\) Photon Storm Ltd\./);
  assert.match(vendorLicense, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test("Paper-Bob cropped sprite manifest entries point to real PNG files with metadata", () => {
  const croppedEntries = spriteMap.entries.filter((entry) => entry.sourceStatus === "cropped");
  const routePropEntries = spriteMap.entries.filter((entry) => entry.atlas === "paper-route-props-atlas.png");
  const lotEntries = spriteMap.entries.filter((entry) => entry.atlas === "paper-bob-lots-atlas.png");
  const trackEntries = spriteMap.entries.filter((entry) => entry.atlas === "paper-bob-track-atlas.png");
  const introEntries = spriteMap.entries.filter((entry) => entry.atlas === "paper-bob-intro-atlas.png");
  const expectedRoutePropFrames = [
    "property_left_01",
    "property_left_02",
    "property_left_03",
    "property_right_01",
    "property_right_02",
    "property_right_03",
    "ramp_metal",
    "ramp_wood",
    "road_center_dashes",
    "road_crack",
    "road_curb_left",
    "road_curb_right",
    "road_driveway_left",
    "road_driveway_right",
    "road_oil_stain",
    "road_paper_scraps",
    "road_surface",
    "road_tire_scuffs",
    "road_worn_mark",
    "side_left_01",
    "side_left_02",
    "side_left_03",
    "side_right_01",
    "side_right_02",
    "side_right_03"
  ];
  const expectedIntroFrames = [
    "intro_bike_down",
    "intro_bob_jump",
    "intro_bob_laydown",
    "intro_bob_read_01",
    "intro_bob_read_02",
    "intro_bob_ride_bubble_gum",
    "intro_bob_ride_front_01",
    "intro_bob_ride_front_02",
    "intro_bob_ride_front_03",
    "intro_bob_ride_front_04",
    "intro_bob_ride_front_05",
    "intro_bob_ride_front_06",
    "intro_bob_ride_peace",
    "intro_bob_spot_finale_01",
    "intro_bob_spot_finale_02",
    "intro_bob_spot_finale_03",
    "intro_bob_spot_finale_04",
    "intro_bob_spot_finale_05",
    "intro_bob_spot_finale_06",
    "intro_bob_turn_left_01",
    "intro_bob_turn_right_01",
    "intro_logo_paper_bob",
    "intro_oip_bob_ride_01",
    "intro_oip_bob_ride_02",
    "intro_oip_bob_ride_03",
    "intro_oip_bob_ride_04",
    "intro_oip_bob_ride_05",
    "intro_oip_bob_ride_06",
    "intro_oip_bob_ride_bubble_gum",
    "intro_oip_bob_ride_peace",
    "intro_oip_bob_spot_finale_01",
    "intro_oip_bob_spot_finale_02",
    "intro_oip_bob_spot_finale_03",
    "intro_oip_bob_spot_finale_04",
    "intro_oip_bob_spot_finale_05",
    "intro_oip_bob_spot_finale_06",
    "intro_oip_setting_plate",
    "intro_oip_spot_paper_side_01",
    "intro_oip_spot_paper_side_02",
    "intro_oip_spot_paper_side_03",
    "intro_oip_spot_paper_side_04",
    "intro_oip_spot_paper_side_05",
    "intro_oip_spot_paper_side_06",
    "intro_sketch_bob_ride_01",
    "intro_sketch_bob_ride_02",
    "intro_sketch_bob_ride_03",
    "intro_sketch_bob_ride_04",
    "intro_sketch_bob_ride_05",
    "intro_sketch_bob_ride_06",
    "intro_sketch_bob_spot_finale_01",
    "intro_sketch_bob_spot_finale_02",
    "intro_sketch_bob_spot_finale_03",
    "intro_sketch_bob_spot_finale_04",
    "intro_sketch_bob_spot_finale_05",
    "intro_sketch_bob_spot_finale_06",
    "intro_sketch_logo_bw",
    "intro_sketch_spot_paper_side_01",
    "intro_sketch_spot_paper_side_02",
    "intro_sketch_spot_paper_side_03",
    "intro_sketch_spot_paper_side_04",
    "intro_sketch_spot_paper_side_05",
    "intro_sketch_spot_paper_side_06",
    "spot_run_back_01",
    "spot_run_back_02",
    "spot_run_back_03",
    "spot_run_front_01",
    "spot_run_front_02",
    "spot_run_front_03",
    "spot_run_paper_side_01",
    "spot_run_paper_side_02",
    "spot_run_paper_side_03",
    "spot_run_paper_side_04",
    "spot_run_paper_side_05",
    "spot_run_paper_side_06",
    "spot_run_side_01",
    "spot_run_side_02",
    "spot_run_side_03",
    "spot_run_side_04",
    "spot_run_side_05",
    "spot_run_side_06",
    "spot_sit_front",
    "spot_sit_paper_back",
    "spot_sit_paper_front"
  ];
  const expectedLotFrames = [
    "property_left_01",
    "property_left_02",
    "property_left_03",
    "property_right_01",
    "property_right_02",
    "property_right_03"
  ];
  const expectedTrackFrames = [
    "track_left_01",
    "track_left_02",
    "track_left_03",
    "track_left_04",
    "track_left_05",
    "track_left_06",
    "track_right_01",
    "track_right_02",
    "track_right_03",
    "track_right_04",
    "track_right_05",
    "track_right_06"
  ];

  assert.equal(croppedEntries.length > 0, true);
  assert.deepEqual(routePropEntries.map((entry) => entry.atlasFrame).sort(), expectedRoutePropFrames);
  assert.deepEqual(lotEntries.map((entry) => entry.atlasFrame).sort(), expectedLotFrames);
  assert.deepEqual(trackEntries.map((entry) => entry.atlasFrame).sort(), expectedTrackFrames);
  assert.deepEqual(introEntries.map((entry) => entry.atlasFrame).sort(), expectedIntroFrames);
  const atlasPath = path.resolve("assets/images/paper-route/paper-route-props-atlas.png");
  const atlasWebpPath = path.resolve("assets/images/paper-route/paper-route-props-atlas.webp");
  const atlasJsonPath = path.resolve("assets/images/paper-route/paper-route-props-atlas.json");
  const lotsAtlasPath = path.resolve("assets/images/paper-route/paper-bob-lots-atlas.png");
  const lotsAtlasWebpPath = path.resolve("assets/images/paper-route/paper-bob-lots-atlas.webp");
  const lotsAtlasJsonPath = path.resolve("assets/images/paper-route/paper-bob-lots-atlas.json");
  const trackAtlasPath = path.resolve("assets/images/paper-route/paper-bob-track-atlas.png");
  const trackAtlasWebpPath = path.resolve("assets/images/paper-route/paper-bob-track-atlas.webp");
  const trackAtlasJsonPath = path.resolve("assets/images/paper-route/paper-bob-track-atlas.json");
  const introAtlasPath = path.resolve("assets/images/paper-route/paper-bob-intro-atlas.png");
  const introAtlasWebpPath = path.resolve("assets/images/paper-route/paper-bob-intro-atlas.webp");
  const introAtlasJsonPath = path.resolve("assets/images/paper-route/paper-bob-intro-atlas.json");
  const atlasMetadata = readPngMetadata(atlasPath);
  const lotsAtlasMetadata = readPngMetadata(lotsAtlasPath);
  const trackAtlasMetadata = readPngMetadata(trackAtlasPath);
  const introAtlasMetadata = readPngMetadata(introAtlasPath);
  const atlasWebpSize = fs.statSync(atlasWebpPath).size;
  const lotsAtlasWebpSize = fs.statSync(lotsAtlasWebpPath).size;
  const trackAtlasWebpSize = fs.statSync(trackAtlasWebpPath).size;
  const introAtlasWebpSize = fs.statSync(introAtlasWebpPath).size;
  const atlas = JSON.parse(fs.readFileSync(atlasJsonPath, "utf8"));
  const lotsAtlas = JSON.parse(fs.readFileSync(lotsAtlasJsonPath, "utf8"));
  const trackAtlas = JSON.parse(fs.readFileSync(trackAtlasJsonPath, "utf8"));
  const introAtlas = JSON.parse(fs.readFileSync(introAtlasJsonPath, "utf8"));
  assert.equal(atlasMetadata.width > 0, true);
  assert.equal(atlasMetadata.height > 0, true);
  assert.equal(atlasWebpSize > 0, true);
  assert.equal(atlasWebpSize < atlasMetadata.fileSizeBytes, true);
  assert.equal(lotsAtlasMetadata.width > 0, true);
  assert.equal(lotsAtlasMetadata.height > 0, true);
  assert.equal(lotsAtlasWebpSize > 0, true);
  assert.equal(lotsAtlasWebpSize < lotsAtlasMetadata.fileSizeBytes, true);
  assert.equal(trackAtlasMetadata.width > 0, true);
  assert.equal(trackAtlasMetadata.height > 0, true);
  assert.equal(trackAtlasWebpSize > 0, true);
  assert.equal(trackAtlasWebpSize < trackAtlasMetadata.fileSizeBytes, true);
  assert.equal(introAtlasMetadata.width > 0, true);
  assert.equal(introAtlasMetadata.height > 0, true);
  assert.equal(introAtlasWebpSize > 0, true);
  assert.equal(introAtlasWebpSize < introAtlasMetadata.fileSizeBytes, true);
  assert.deepEqual(Object.keys(atlas.frames).sort(), expectedRoutePropFrames);
  assert.deepEqual(Object.keys(lotsAtlas.frames).sort(), expectedLotFrames);
  assert.deepEqual(Object.keys(trackAtlas.frames).sort(), expectedTrackFrames);
  assert.deepEqual(Object.keys(introAtlas.frames).sort(), expectedIntroFrames);
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
  assert.doesNotMatch(launcher, /data-paper-route-plan-src/);
  assert.match(launcher, /data-paper-route-game-src/);
  assert.match(launcher, /data-paper-route-bob-src/);
  assert.match(launcher, /data-paper-route-bob-sheet-src/);
  assert.match(launcher, /data-paper-route-bob-sheet-webp-src/);
  assert.match(launcher, /data-paper-route-paper-webp-src/);
  assert.match(launcher, /data-paper-route-puddle-splash-src/);
  assert.match(launcher, /data-paper-route-puddle-splash-webp-src/);
  assert.match(launcher, /data-paper-route-props-atlas-src/);
  assert.match(launcher, /data-paper-route-props-atlas-webp-src/);
  assert.match(launcher, /data-paper-route-props-atlas-json-src/);
  assert.match(launcher, /data-paper-route-lots-atlas-src/);
  assert.match(launcher, /data-paper-route-lots-atlas-webp-src/);
  assert.match(launcher, /data-paper-route-lots-atlas-json-src/);
  assert.match(launcher, /data-paper-route-track-atlas-src/);
  assert.match(launcher, /data-paper-route-track-atlas-webp-src/);
  assert.match(launcher, /data-paper-route-track-atlas-json-src/);
  assert.match(launcher, /data-paper-route-intro-atlas-src/);
  assert.match(launcher, /data-paper-route-intro-atlas-webp-src/);
  assert.match(launcher, /data-paper-route-intro-atlas-json-src/);
  assert.match(launcher, /window\.Phaser/);
  assert.match(launcher, /window\.OipPaperRouteRules/);
  assert.doesNotMatch(launcher, /window\.OipPaperRoutePlan/);
  assert.match(launcher, /window\.OipPaperRouteGame/);
  assert.match(launcher, /bobSrc: bobSrc/);
  assert.match(launcher, /bobSheetSrc: bobSheetSrc/);
  assert.match(launcher, /bobSheetWebpSrc: bobSheetWebpSrc/);
  assert.match(launcher, /paperSrc: paperSrc/);
  assert.match(launcher, /paperWebpSrc: paperWebpSrc/);
  assert.match(launcher, /propsAtlasSrc: propsAtlasSrc/);
  assert.match(launcher, /propsAtlasWebpSrc: propsAtlasWebpSrc/);
  assert.match(launcher, /propsAtlasJsonSrc: propsAtlasJsonSrc/);
  assert.match(launcher, /lotsAtlasSrc: lotsAtlasSrc/);
  assert.match(launcher, /lotsAtlasWebpSrc: lotsAtlasWebpSrc/);
  assert.match(launcher, /lotsAtlasJsonSrc: lotsAtlasJsonSrc/);
  assert.match(launcher, /trackAtlasSrc: trackAtlasSrc/);
  assert.match(launcher, /trackAtlasWebpSrc: trackAtlasWebpSrc/);
  assert.match(launcher, /trackAtlasJsonSrc: trackAtlasJsonSrc/);
  assert.match(launcher, /introAtlasSrc: introAtlasSrc/);
  assert.match(launcher, /introAtlasWebpSrc: introAtlasWebpSrc/);
  assert.match(launcher, /introAtlasJsonSrc: introAtlasJsonSrc/);
  assert.match(launcher, /skipIntroButton/);
  assert.match(launcher, /paper-route-open/);
  assert.match(launcher, /aria-busy/);
  assert.match(launcher, /runtimePromise = null/);
  assert.match(launcher, /var dialog = overlay\.querySelector\("\.paper-route-dialog"\)/);
  assert.match(launcher, /dialog\.focus\(\{ preventScroll: true \}\)/);
  assert.match(launcher, /event\.key === "Escape"/);
  assert.doesNotMatch(launcher, /event\.key === "Enter"/);
  assert.doesNotMatch(launcher, /closeButton\.focus/);
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
  assert.match(rules, /RouteRules\.prototype\.clearPuddle = function \(source\)/);
  assert.match(rules, /this\.state\.wheelie[\s\S]*return this\.clearPuddle\("wheelie"\)/);
  assert.match(rules, /options && options\.forceHit === true/);
  assert.match(rules, /RouteRules\.prototype\.takeRamp/);
  assert.match(rules, /RouteRules\.prototype\.startWheelie/);
  assert.match(rules, /root\.OipPaperRouteRules/);
});

test("Paper-Bob game uses Arcade Physics, V2 controls, and the approved storage key", () => {
  assert.match(game, /STORAGE_KEY = "oip-paper-route:v2"/);
  assert.match(game, /default: "arcade"/);
  assert.match(game, /scene\.load\.image\("paperBobSprite", this\.bobSrc\)/);
  assert.match(game, /browserSupportsWebp/);
  assert.match(game, /assetSrc/);
  assert.match(game, /scene\.load\.spritesheet\("paperBobSheet", this\.assetSrc\(this\.bobSheetSrc, this\.bobSheetWebpSrc\)/);
  assert.match(game, /scene\.load\.atlas\("paperRouteProps", this\.assetSrc\(this\.propsAtlasSrc, this\.propsAtlasWebpSrc\), this\.propsAtlasJsonSrc\)/);
  assert.match(game, /scene\.load\.atlas\("paperBobLots", this\.assetSrc\(this\.lotsAtlasSrc, this\.lotsAtlasWebpSrc\), this\.lotsAtlasJsonSrc\)/);
  assert.match(game, /scene\.load\.atlas\("paperBobTrack", this\.assetSrc\(this\.trackAtlasSrc, this\.trackAtlasWebpSrc\), this\.trackAtlasJsonSrc\)/);
  assert.match(game, /scene\.load\.atlas\("paperBobIntro", this\.assetSrc\(this\.introAtlasSrc, this\.introAtlasWebpSrc\), this\.introAtlasJsonSrc\)/);
  assert.match(game, /loadDeferredRouteAssets/);
  assert.match(game, /queueDeferredRouteAssets/);
  assert.match(game, /finishDeferredRouteAssets/);
  assert.match(game, /routeAssetsStarted/);
  assert.match(game, /routeAssetsReady/);
  assert.match(game, /routeLoadProgress/);
  assert.match(game, /TRACK_SEGMENT_CONFIGS/);
  assert.match(game, /TRACK_SEGMENT_FRAMES/);
  assert.match(game, /track_left_01/);
  assert.match(game, /track_left_06/);
  assert.match(game, /track_right_01/);
  assert.match(game, /track_right_06/);
  assert.match(game, /INTRO_DURATION = 10\.2/);
  assert.match(game, /INTRO_BEAT_SEQUENCE/);
  assert.match(game, /key: "sketch-draw", start: 0, end: 2/);
  assert.match(game, /key: "bob-ride", start: 2, end: 4\.3/);
  assert.match(game, /key: "spot-cross", start: 4\.3, end: 6/);
  assert.match(game, /key: "finale", start: 6, end: 8\.4/);
  assert.match(game, /key: "hold", start: 8\.4, end: 10\.2/);
  assert.match(game, /INTRO_OIP_SETTING_FRAME = "intro_oip_setting_plate"/);
  assert.match(game, /INTRO_BOB_SPOT_FINALE_FRAMES = \["intro_bob_spot_finale_01"/);
  assert.match(game, /INTRO_RIDE_PERSONALITY_FRAMES = \["intro_bob_ride_bubble_gum", "intro_bob_ride_peace"\]/);
  assert.match(game, /INTRO_OIP_BOB_RIDE_FRAMES = \["intro_oip_bob_ride_01"/);
  assert.match(game, /INTRO_OIP_BOB_PERSONALITY_FRAMES = \["intro_oip_bob_ride_bubble_gum", "intro_oip_bob_ride_peace"\]/);
  assert.match(game, /INTRO_OIP_SPOT_PAPER_SIDE_FRAMES = \["intro_oip_spot_paper_side_01"/);
  assert.match(game, /INTRO_OIP_BOB_SPOT_FINALE_FRAMES = \["intro_oip_bob_spot_finale_01"/);
  assert.match(game, /INTRO_SKETCH_BOB_RIDE_FRAMES = \["intro_sketch_bob_ride_01"/);
  assert.match(game, /INTRO_SKETCH_SPOT_PAPER_SIDE_FRAMES = \["intro_sketch_spot_paper_side_01"/);
  assert.match(game, /INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES = \["intro_sketch_bob_spot_finale_01"/);
  assert.match(game, /introColorBlendAt/);
  assert.match(game, /introOipBlendAt/);
  assert.match(game, /introRideFrameAt/);
  assert.match(game, /key === "Enter"[\s\S]*this\.introPrepComplete[\s\S]*this\.skipIntro\(\)/);
  assert.match(game, /setPointerCapture[\s\S]*try[\s\S]*catch/);
  assert.match(game, /window\.innerWidth <= 720/);
  assert.match(game, /PaperRouteGame\.prototype\.bindStagePointerInput/);
  assert.match(game, /scene\.input\.on\("pointerdown"/);
  assert.match(game, /scene\.input\.on\("pointermove"/);
  assert.match(game, /scene\.input\.on\("pointerup"/);
  assert.match(game, /PaperRouteGame\.prototype\.handleStagePointerDown[\s\S]*this\.skipIntro\(\)/);
  assert.match(game, /this\.touchControlMode = "gameboy-dock"/);
  assert.match(game, /PaperRouteGame\.prototype\.handleStagePointerDown[\s\S]*this\.lastTouchZone = "gamepad-only"[\s\S]*this\.clearStageTouchState\(\)/);
  assert.doesNotMatch(game, /zone === "left-panel"[\s\S]*this\.throwPaper\("left", true\)/);
  assert.doesNotMatch(game, /zone === "right-panel"[\s\S]*this\.throwPaper\("right", true\)/);
  assert.match(game, /action === "steer-left"[\s\S]*this\.heldLeft = pressed/);
  assert.match(game, /action === "steer-right"[\s\S]*this\.heldRight = pressed/);
  assert.match(game, /action === "steer-up"[\s\S]*this\.heldUp = pressed/);
  assert.match(game, /action === "steer-down"[\s\S]*this\.heldDown = pressed/);
  assert.match(game, /this\.lastTouchZone = "gamepad-" \+ action/);
  assert.match(game, /this\.dpadSurface = this\.touchPanel[\s\S]*querySelector\("\[data-paper-route-dpad\]"\)/);
  assert.match(game, /button\.closest && button\.closest\("\[data-paper-route-dpad\]"\)[\s\S]*return;/);
  assert.match(game, /claimTouchActionPointer\(action, event\)/);
  assert.match(game, /releaseTouchActionPointer\(action, event\)/);
  assert.match(game, /PaperRouteGame\.prototype\.claimTouchActionPointer/);
  assert.match(game, /PaperRouteGame\.prototype\.releaseTouchActionPointer/);
  assert.match(game, /pointerId = event && event\.pointerId !== undefined \? this\.touchActionPointerId\(event\) : null/);
  assert.match(game, /if \(pointerId !== null && this\.touchActionPointerIds\[action\] !== pointerId\)/);
  assert.match(game, /PaperRouteGame\.prototype\.clearTouchActionState/);
  assert.match(game, /"contextmenu", "selectstart", "dragstart"/);
  assert.match(game, /PaperRouteGame\.prototype\.bindDpadSurface/);
  assert.match(game, /PaperRouteGame\.prototype\.updateDpadFromPointerEvent/);
  assert.match(game, /dpadDeadZoneRatio: \.1/);
  assert.match(game, /dpadAxisThresholdRatio: \.24/);
  assert.match(game, /vectorX = clamp\(dx \/ \(rect\.width \/ 2\), -1, 1\)/);
  assert.match(game, /vectorY = clamp\(dy \/ \(rect\.height \/ 2\), -1, 1\)/);
  assert.match(game, /Math\.abs\(vectorX\) >= axisThreshold/);
  assert.match(game, /Math\.abs\(vectorY\) >= axisThreshold/);
  assert.match(game, /direction = vertical && horizontal \? vertical \+ "-" \+ horizontal : \(horizontal \|\| vertical\)/);
  assert.match(game, /PaperRouteGame\.prototype\.applyDpadDirection[\s\S]*this\.heldLeft = horizontal === "left"[\s\S]*this\.heldDown = vertical === "down"/);
  assert.match(game, /this\.dpadVectorX = this\.heldLeft \? -1 : \(this\.heldRight \? 1 : 0\)/);
  assert.match(game, /this\.dpadVectorY = this\.heldUp \? -1 : \(this\.heldDown \? 1 : 0\)/);
  assert.match(game, /PaperRouteGame\.prototype\.syncDpadFeedback/);
  assert.match(game, /PaperRouteGame\.prototype\.releaseDpad[\s\S]*this\.dpadActive = false/);
  assert.match(game, /dpadActive/);
  assert.match(game, /dpadDirection/);
  assert.match(game, /dpadVectorX/);
  assert.match(game, /dpadVectorY/);
  assert.match(game, /touchSteerTargetX/);
  assert.match(game, /touchThrowLeftHeld/);
  assert.match(game, /touchThrowRightHeld/);
  assert.match(game, /touchJumpBuffer: \.14/);
  assert.match(game, /touchPaperCooldown: 280/);
  assert.match(game, /this\.touchThrowLeftHeld && this\.throwCooldown <= 0/);
  assert.match(game, /this\.touchThrowRightHeld && this\.throwCooldown <= 0/);
  assert.match(game, /this\.keys\.space\.isDown \|\| this\.touchJumpHeld \|\| this\.touchJumpBuffer > 0/);
  assert.match(game, /PaperRouteGame\.prototype\.setTouchActionFeedback/);
  assert.match(game, /touchActions: \{[\s\S]*throwLeft: this\.touchThrowLeftHeld[\s\S]*jumpBuffer: Math\.round\(this\.touchJumpBuffer \* 1000\) \/ 1000[\s\S]*trick: this\.touchTrickHeld/);
  assert.match(game, /SPOT_RUN_PAPER_SIDE_FRAMES = \["spot_run_paper_side_01"/);
  assert.match(game, /spots: 1/);
  assert.match(game, /spotFirstDelay: 8000/);
  assert.match(game, /spotInterval: 12000/);
  assert.match(game, /spotSpeed: 360/);
  assert.match(game, /this\.spots = scene\.physics\.add\.group\(\)/);
  assert.match(game, /scene\.physics\.add\.overlap\(this\.player, this\.spots/);
  assert.match(game, /create\("spotRunPaperSide", SPOT_RUN_PAPER_SIDE_FRAMES, 8, -1\)/);
  assert.match(game, /create\("introBobSpotFinale", INTRO_BOB_SPOT_FINALE_FRAMES, 4, 0\)/);
  assert.match(game, /create\("introOipBobRide", INTRO_OIP_BOB_RIDE_FRAMES, 7, -1\)/);
  assert.match(game, /create\("introOipSpotPaperSide", INTRO_OIP_SPOT_PAPER_SIDE_FRAMES, 8, -1\)/);
  assert.match(game, /create\("introOipBobSpotFinale", INTRO_OIP_BOB_SPOT_FINALE_FRAMES, 4, 0\)/);
  assert.match(game, /finale: scene\.add\.sprite\(this\.width \* \.46, this\.height \* \.62, "paperBobIntro", INTRO_BOB_SPOT_FINALE_FRAMES\[0\]\)/);
  assert.match(game, /PaperRouteGame\.prototype\.positionIntroFinale/);
  assert.match(game, /spot\.setTexture\("paperBobIntro", frame\)/);
  assert.match(game, /this\.spotTimer = TUNING\.spotFirstDelay \/ 1000/);
  assert.match(game, /PaperRouteGame\.prototype\.spawnSpot/);
  assert.match(game, /this\.spotTimer = TUNING\.spotInterval \/ 1000/);
  assert.match(game, /PaperRouteGame\.prototype\.hitSpot[\s\S]*if \(this\.rules\.state\.airborne\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(game, /effects = this\.applyPuddleContact\(spot\.x, spot\.y, true\)/);
  assert.match(game, /spot\.setData\("carryingPaper", true\)/);
  assert.match(game, /spot\.anims\.play\("spotRunPaperSide", true\)/);
  assert.match(game, /PaperRouteGame\.prototype\.bounceSpotAfterHit/);
  assert.match(game, /spotNextIn/);
  assert.match(game, /visibleSpots/);
  assert.match(game, /create\("introSketchBobRide", INTRO_SKETCH_BOB_RIDE_FRAMES, 7, -1\)/);
  assert.match(game, /create\("introSketchSpotPaperSide", INTRO_SKETCH_SPOT_PAPER_SIDE_FRAMES, 8, -1\)/);
  assert.match(game, /create\("introSketchBobSpotFinale", INTRO_SKETCH_BOB_SPOT_FINALE_FRAMES, 4, 0\)/);
  assert.match(game, /PaperRouteGame\.prototype\.createIntroSketchObjects/);
  assert.match(game, /setting: scene\.add\.image\(this\.width \* \.5, this\.height \* \.5, "paperBobIntro", INTRO_OIP_SETTING_FRAME\)/);
  assert.match(game, /oipBob: scene\.add\.sprite\(this\.width \* \.5, this\.height \* \.56, "paperBobIntro", INTRO_OIP_BOB_RIDE_FRAMES\[0\]\)/);
  assert.match(game, /PaperRouteGame\.prototype\.drawIntroSketchDecor/);
  assert.match(game, /PaperRouteGame\.prototype\.holdIntroSketchFinale[\s\S]*this\.reducedMotion[\s\S]*introSketchLayer\.setVisible\(true\)/);
  assert.match(game, /introBeat/);
  assert.match(game, /introBobFrame/);
  assert.match(game, /introSpotFrame/);
  assert.match(game, /introFinaleFrame/);
  assert.match(game, /introSpotVisible/);
  assert.match(game, /introFinaleVisible/);
  assert.match(game, /introSketchVisible/);
  assert.match(game, /introSketchReveal/);
  assert.match(game, /introColorBlend/);
  assert.match(game, /introOipBlend/);
  assert.match(game, /introSketchFrame/);
  assert.match(game, /introSettingVisible/);
  assert.match(game, /introSettingFrame/);
  assert.match(game, /touchControlMode/);
  assert.match(game, /touchSteerActive/);
  assert.match(game, /touchSteerTargetX/);
  assert.match(game, /lastTouchZone/);
  assert.match(game, /targetGroups/);
  assert.match(game, /trackSegmentSpawnBuffer: 90/);
  assert.doesNotMatch(game, /PROPERTY_CONFIGS|SIDE_BASE_FRAMES|side_base_left_01|side_base_right_03|fallbackFrame: "property_left_01"|fallbackFrame: "property_right_03"/);
  assert.match(game, /ROAD_DECAL_CONFIGS/);
  assert.match(game, /road_crack/);
  assert.match(game, /road_tire_scuffs/);
  assert.doesNotMatch(game, /ROAD_DECAL_CONFIGS[\s\S]*road_oil_stain/);
  assert.doesNotMatch(game, /ROAD_DECAL_CONFIGS[\s\S]*road_paper_scraps/);
  assert.doesNotMatch(game, /ROAD_DECAL_CONFIGS[\s\S]*road_worn_mark/);
  assert.match(game, /TRACK_ROAD_SEAM_OVERLAP = 1/);
  assert.match(game, /road_surface/);
  assert.match(game, /road_center_dashes/);
  assert.match(game, /road_curb_left/);
  assert.match(game, /road_curb_right/);
  assert.match(game, /createRoadKitObjects/);
  assert.match(game, /seedTrackSegments/);
  assert.match(game, /spawnTrackSegment/);
  assert.match(game, /ensureTrackSegmentCoverage/);
  assert.match(game, /updateTrackSegments/);
  assert.match(game, /scene\.add\.tileSprite\(0, 0, roadFrame\.width, this\.height, "paperRouteProps", "road_surface"\)/);
  assert.match(game, /scene\.add\.image\(-999, -999, "paperBobTrack", TRACK_SEGMENT_FRAMES\.left\[0\]\)/);
  assert.match(game, /roadLeftCurb\.setVisible\(!integratedTrackActive\)/);
  assert.match(game, /roadRightCurb\.setVisible\(!integratedTrackActive\)/);
  assert.match(game, /PaperRouteGame\.prototype\.updateRoadKitObjects[\s\S]*integratedTrackActive = this\.hasIntegratedTrackAtlas\(\)[\s\S]*roadLeftCurb\.setVisible\(!integratedTrackActive\)[\s\S]*roadRightCurb\.setVisible\(!integratedTrackActive\)/);
  assert.match(game, /this\.roadSurface\.tilePositionY = -this\.routeOffset/);
  assert.match(game, /this\.roadCenterLine\.tilePositionY = -this\.routeOffset/);
  assert.match(game, /this\.roadLeftCurb\.tilePositionY = -this\.routeOffset/);
  assert.match(game, /this\.roadRightCurb\.tilePositionY = -this\.routeOffset/);
  assert.match(game, /this\.routeOffset \+= scrollDelta/);
  assert.match(game, /this\.updateTrackSegments\(scrollDelta\)/);
  assert.match(game, /assetBackedRoute = this\.hasRoutePropsFrame\("road_surface"\) \|\| this\.hasIntegratedTrackAtlas\(\) \|\| this\.hasLotsAtlas\(\)/);
  assert.match(game, /if \(!assetBackedRoute\) \{/);
  assert.match(game, /hasLotsAtlas/);
  assert.match(game, /hasTrackAtlas/);
  assert.match(game, /hasIntegratedTrackAtlas/);
  assert.doesNotMatch(game, /propertyTexture|this\.getPooledObject\("properties"\)|propertySpawnBuffer|property\.setPosition\(x, -displayHeight \/ 2 - TUNING\.propertySpawnBuffer\)|property\.setVelocityY\(speed\)|property\.setData\("propertyTop"|property\.setData\("propertyBottom"/);
  assert.doesNotMatch(game, /createAttachedSideRun|positionAttachedSideRun|seedOpeningSideLots|sideRunSeamOverlap|sideLotEntrySeamY|sideLotVisualLeadSeconds/);
  assert.match(game, /positionTrackSegmentHitbox/);
  assert.match(game, /target\.setData\("property", segment\)/);
  assert.match(game, /target\.setData\("segment", segment\)/);
  assert.match(game, /target\.setData\("targetConfig", config\)/);
  assert.doesNotMatch(game, /prototype\.seedSideRuns|prototype\.spawnSideRun|prototype\.ensureSideRunCoverage|this\.sideRuns|side_left_01|side_right_03/);
  assert.match(game, /spawnRoadDecal/);
  assert.match(game, /scene\.add\.tileSprite/);
  assert.match(game, /createTrackSegmentHitbox/);
  assert.match(game, /bobRunEnd/);
  assert.match(game, /bobWheelieRise/);
  assert.doesNotMatch(game, /create\("bobWheelie", \[[^\n]+, 8, -1\)/);
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
  assert.match(game, /cleared = effects\[0\] && effects\[0\]\.type === "puddle-clear"/);
  assert.match(game, /this\.puddleBurst\(x, y, cleared\)/);
  assert.match(game, /routePropsAtlasLoaded/);
  assert.match(game, /lotsAtlasLoaded/);
  assert.match(game, /trackAtlasLoaded/);
  assert.match(game, /roadKitLoaded/);
  assert.match(game, /trackSegmentsLoaded/);
  assert.match(game, /Bag packed\. Toss clean, hop ramps, dodge puddles\./);
  assert.match(game, /Paper-Bob is loaded\. Hit the street\./);
  assert.match(game, /Final score " \+ state\.score/);
  assert.match(game, /summaryMetricItems/);
  assert.match(game, /renderSummaryMetrics\(state\)/);
  assert.match(game, /showFinalScore\(state\.score\)/);
  assert.match(game, /finalScoreText/);
  assert.match(game, /overlayLayout/);
  assert.match(game, /summaryMetrics: this\.lastSummaryMetrics/);
  assert.doesNotMatch(game, /Route open\. Throw left or right|Reading final edition|Route closed\./);
  assert.match(game, /segmentTop: child\.getData/);
  assert.match(game, /displayHeight: Math\.round\(child\.displayHeight/);
  assert.match(game, /routeLayering/);
  assert.match(game, /roadSurfaceLeft/);
  assert.match(game, /trackLeftRightEdge/);
  assert.match(game, /leftCurbVisible/);
  assert.doesNotMatch(game, /sideRunsLoaded|visibleSideRuns|visibleSideBases|attachedPropertyFrame|lotSeamY|sideBaseLoaded/);
  assert.match(game, /visibleRoadDecals/);
  assert.match(game, /visibleTrackSegments/);
  assert.match(game, /beginIntro/);
  assert.match(game, /skipIntro/);
  assert.match(game, /createObjectPools/);
  assert.doesNotMatch(game, /prewarmTextures|spawnPlannedEvents|window\.OipPaperRoutePlan\.createRoutePlan|routePlanReady|routePlanCounts|routeSeed|routePrewarmProgress|prewarmComplete/);
  assert.match(game, /poolCounts/);
  assert.match(game, /PaperRouteGame\.prototype\.showStartCard[\s\S]*pauseButton[\s\S]*disabled = true/);
  assert.match(game, /PaperRouteGame\.prototype\.showStartCard[\s\S]*restartButton[\s\S]*disabled = true/);
  assert.match(game, /PaperRouteGame\.prototype\.showStartCard[\s\S]*startButton[\s\S]*disabled = !this\.introComplete/);
  assert.match(game, /PaperRouteGame\.prototype\.showStartCard[\s\S]*startButton\.focus/);
  assert.match(game, /setTouchPanel\(true\)/);
  assert.match(game, /window\.render_game_to_text/);
  assert.match(game, /window\.advanceTime/);
  assert.match(game, /steerSpeed: 270/);
  assert.match(game, /verticalSteerSpeed: 155/);
  assert.match(game, /touchSteerAssist: 1\.14/);
  assert.match(game, /touchVerticalAssist: 1\.16/);
  assert.match(game, /paperSpeed: 520/);
  assert.match(game, /paperLift: -92/);
  assert.match(game, /paperBody: \{ width: 21, height: 13 \}/);
  assert.match(game, /paperOffscreenPadding: 48/);
  assert.match(game, /paperWrapGuard: 96/);
  assert.match(game, /paper\.setVelocity\(sign \* TUNING\.paperSpeed, TUNING\.paperLift\)/);
  assert.match(game, /paper\.body\.setSize\(TUNING\.paperBody\.width, TUNING\.paperBody\.height, true\)/);
  assert.match(game, /paper\.setData\("originX", paper\.x\)/);
  assert.match(game, /PaperRouteGame\.prototype\.paperIsOutOfPlay = function \(paper\)/);
  assert.match(game, /direction === "left"[\s\S]*paper\.x > originX \+ TUNING\.paperWrapGuard/);
  assert.match(game, /direction === "right"[\s\S]*paper\.x < originX - TUNING\.paperWrapGuard/);
  assert.match(game, /if \(self\.paperIsOutOfPlay\(paper\)\) \{[\s\S]*self\.applyEffects\(self\.rules\.missPaper\(\)\)/);
  assert.match(game, /scoreDelivery/);
  assert.match(game, /if \(type === "doorstep"\) \{[\s\S]*effects = this\.rules\.hitDoorstep\(!!paper\.getData\("airborneThrow"\)\);[\s\S]*\} else if \(type === "window"\) \{[\s\S]*effects = this\.rules\.hitWindow\(!!paper\.getData\("airborneThrow"\)\);[\s\S]*\} else \{[\s\S]*effects = this\.rules\.hitMailbox\(!!paper\.getData\("airborneThrow"\)\);/);
  assert.match(game, /takeRamp/);
  assert.match(game, /hitPuddle/);
  assert.match(game, /writeHighScore/);
  assert.doesNotMatch(game, /localStorage\.setItem\((?!STORAGE_KEY)/);
  assert.doesNotMatch(game, /hitObstacle|spawnObstacle|paperRouteObstacle/);
});

test("Paper-Bob Spot contact lets jumps escape while wheelies still take the hit", () => {
  const hitSpotMatch = game.match(/PaperRouteGame\.prototype\.hitSpot = function \(spot\) \{[\s\S]*?\n  \};/);
  assert.ok(hitSpotMatch);
  const hitSpot = hitSpotMatch[0];
  assert.match(hitSpot, /if \(this\.rules\.state\.airborne\) \{[\s\S]*return;[\s\S]*\}[\s\S]*effects = this\.applyPuddleContact\(spot\.x, spot\.y, true\)/);
  assert.doesNotMatch(hitSpot, /wheelie/);
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
  assert.match(css, /\.paper-route-dialog\{[\s\S]*height:min\(960px, calc\(100dvh/);
  assert.match(css, /\.paper-route-dialog\{[\s\S]*overflow:hidden;/);
  assert.match(css, /\.paper-route-dialog\{[\s\S]*gap:\.36rem;/);
  assert.match(css, /\.paper-route-dialog\{[\s\S]*padding:\.75rem \.85rem \.7rem;/);
  assert.match(css, /\.paper-route-stage\{[\s\S]*height:min\(100%, 760px, calc\(100dvh - 8\.9rem\)\);/);
  assert.match(css, /\.paper-route-stage\{[\s\S]*max-width:min\(100%, 520px\);/);
  assert.match(css, /\.paper-route-game\{[\s\S]*touch-action:none;[\s\S]*user-select:none;/);
  assert.match(css, /\.paper-route-game canvas\{[\s\S]*touch-action:none;[\s\S]*user-select:none;/);
  assert.match(css, /\.paper-route-intro\{[\s\S]*position:absolute;/);
  assert.match(css, /\.paper-route-intro__meter span\{[\s\S]*transition:width \.18s linear;/);
  assert.match(css, /\.paper-route-stage--intro-ready \.paper-route-card--start/);
  assert.match(css, /\.paper-route-stage--intro-ready \.paper-route-card--start\{[\s\S]*right:\.65rem;[\s\S]*transform:translateY\(-38%\);/);
  assert.match(css, /\.paper-route-cabinet-label/);
  assert.match(css, /\.paper-route-card--failure/);
  assert.match(css, /\.paper-route-dialog__button\[aria-pressed="true"\]/);
  assert.match(css, /\.paper-route-stage--paused \.paper-route-game/);
  assert.match(css, /--paper-route-ticket:/);
  assert.match(css, /\.paper-route-card::before\{[\s\S]*content:"Paper-Bob";/);
  assert.match(css, /\.paper-route-overlay \.paper-route-card\.paper-route-card--summary\{[\s\S]*background:none;[\s\S]*pointer-events:none;/);
  assert.match(css, /\.paper-route-results\{[\s\S]*grid-template-columns:repeat\(6, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.paper-route-result-tile--mailbox/);
  assert.match(css, /\.paper-route-result-tile--puddle/);
  assert.match(css, /\.paper-route-overlay \.paper-route-card \.paper-route-summary__restart\{[\s\S]*animation:paper-route-restart-pulse 2\.8s/);
  assert.match(css, /\.paper-route-dialog__status\{[\s\S]*border-left:2px solid/);
  assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.paper-route-scorebar\{[\s\S]*grid-template-columns:repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.paper-route-stage\{[\s\S]*height:min\(100%, 620px, calc\(100dvh - 10\.8rem\)\);/);
  assert.match(css, /\.paper-route-touch\{[\s\S]*grid-template-columns:minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.match(css, /\.paper-route-touch\{[\s\S]*touch-action:none;[\s\S]*overscroll-behavior:contain;[\s\S]*-webkit-touch-callout:none;[\s\S]*-webkit-tap-highlight-color:transparent;/);
  assert.match(css, /\.paper-route-touch__pad\{[\s\S]*grid-template-columns:repeat\(3, 2\.12rem\);[\s\S]*touch-action:none;/);
  assert.match(css, /\.paper-route-touch__actions\{[\s\S]*position:relative;[\s\S]*width:7rem;[\s\S]*height:5\.8rem;[\s\S]*transform:translateX\(-\.32rem\);/);
  assert.match(css, /\.paper-route-touch__button--y\{[\s\S]*left:0;[\s\S]*top:1\.62rem;/);
  assert.match(css, /\.paper-route-touch__button--a\{[\s\S]*left:4\.28rem;[\s\S]*top:1\.62rem;/);
  assert.match(css, /\.paper-route-touch button\{[\s\S]*touch-action:none;[\s\S]*-webkit-touch-callout:none;[\s\S]*-webkit-tap-highlight-color:transparent;/);
  assert.match(css, /\.paper-route-touch__button--action\[data-paper-route-action-active="true"\]\{[\s\S]*transform:translateY\(2px\);/);
  assert.match(css, /\.paper-route-touch__button--dpad\[data-paper-route-dpad-active="true"\]\{[\s\S]*transform:translateY\(2px\);/);
  assert.match(css, /@media \(hover:none\), \(pointer:coarse\)\{[\s\S]*--paper-route-control-dock-height:10\.15rem;[\s\S]*\.paper-route-game\{[\s\S]*bottom:var\(--paper-route-control-dock-height\);[\s\S]*\.paper-route-touch\{[\s\S]*display:grid;/);
  assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.paper-route-stage\{[\s\S]*--paper-route-control-dock-height:10\.15rem;[\s\S]*align-self:start;[\s\S]*\.paper-route-game\{[\s\S]*bottom:var\(--paper-route-control-dock-height\);/);
  assert.match(css, /@media \(max-width:720px\)\{[\s\S]*\.paper-route-touch\{[\s\S]*display:grid;[\s\S]*grid-template-columns:minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /html\[data-theme="light"\] \.paper-route-dialog/);
});
