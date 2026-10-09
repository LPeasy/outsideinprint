import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const stable = value => Array.isArray(value) ? value.map(stable) :
  value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
export function imageCacheIdentity({ os, hugoVersion, imaging, implementation, manifest, otherInputs = {} }) {
  const compatibility = hash({ imaging, implementation, defaults: manifest.defaults }).slice(0, 24);
  const prefix = os + "-hugo-resources-" + hugoVersion + "-" + compatibility + "-";
  const assets = Object.entries(manifest.assets)
    .filter(([, asset]) => asset.review_state === "approved" && asset.processing_state === "derivative_capable")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, asset]) => ({ id, source: asset.source, sha256: asset.sha256, width: asset.width, height: asset.height, image_class: asset.image_class, processing_hint: asset.processing_hint, quality_override: asset.quality_override ?? null }));
  return { prefix, key: prefix + hash({ assets, otherInputs }) };
}
export function collectOtherImageInputs(root = ".") {
  const inputs = {};
  for (const directory of ["assets", "content"]) {
    const absoluteDirectory = path.join(root, directory);
    if (!fs.existsSync(absoluteDirectory)) continue;
    for (const file of fs.readdirSync(absoluteDirectory, { recursive: true, withFileTypes: true })) {
      if (!file.isFile() || !/\.(avif|bmp|gif|jpe?g|png|tiff?|webp)$/i.test(file.name)) continue;
      const absolute = path.join(file.parentPath ?? file.path, file.name);
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (relative.startsWith("assets/images/originals/")) continue;
      inputs[relative] = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    }
  }
  return inputs;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(fs.readFileSync("data/image-assets.json", "utf8"));
  const imaging = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).imaging;
  if (!imaging) throw new Error("Resolved Hugo imaging configuration is required.");
  const implementation = {};
  for (const file of [
    ...fs.readdirSync("layouts/partials/images").map(name => path.posix.join("layouts/partials/images", name)),
    "layouts/_default/_markup/render-image.html", "layouts/partials/metadata_image.html",
    "layouts/partials/opengraph.html", "layouts/partials/twitter_cards.html", "layouts/partials/schema/image.html",
    "layouts/partials/games/picture.html", "layouts/partials/home_idle_bob.html",
  ]) implementation[file] = fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  implementation.mastheadImages = fs.readFileSync("layouts/partials/masthead.html", "utf8").split(/\r?\n/).filter(line => /paperBobIcon.*(?::=|=)|\.Resize /.test(line));
  const otherInputs = collectOtherImageInputs();
  const tools = JSON.parse(fs.readFileSync("tools/toolchain.manifest.json", "utf8"));
  const identity = imageCacheIdentity({ os: process.env.RUNNER_OS, hugoVersion: tools.tools.find(tool => tool.name === "hugo").version, imaging, implementation, manifest, otherInputs });
  fs.appendFileSync(process.env.GITHUB_OUTPUT, "key=" + identity.key + "\nprefix=" + identity.prefix + "\n");
  console.log(JSON.stringify(identity));
}
