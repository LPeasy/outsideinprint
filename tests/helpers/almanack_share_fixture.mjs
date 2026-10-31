import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

export function buildShareFixture() {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "oip-almanack-share-"));
  const put = (relative, value) => {
    const target = path.join(site, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value);
  };
  fs.cpSync(path.join(root, "layouts/partials"), path.join(site, "layouts/partials"), { recursive: true });
  put("layouts/almanack/single.html", fs.readFileSync(path.join(root, "layouts/almanack/single.html")));
  put("layouts/essays/single.html", '{{ define "main" }}{{ partial "article/share.html" . }}{{ end }}');
  put("layouts/_default/baseof.html", '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>{{ readFile "assets/css/main.css" | safeCSS }}</style></head><body class="section-almanack"><main>{{ block "main" . }}{{ end }}</main>{{ partial "article/share-script.html" . }}</body></html>');
  put("layouts/partials/metadata/page.html", '{{ return (dict "title" (.Params.metadata_title | default .Title) "canonical" .Permalink "policy" (dict "indexable" (not .Params.noindex)) "route" (dict "name" "article")) }}');
  put("layouts/partials/newsletter_signup.html", '<aside id="{{ .anchorID }}" class="{{ .class }}" data-source-slot="{{ .sourceSlot }}">Existing newsletter signup</aside>');
  // Preserve the actual picture partial; this fixture tests shell composition,
  // not the unchanged image-processing pipeline or the full image library.
  put("layouts/partials/images/model.html", '{{ return (dict "managed" true "id" .ref "signature_enabled" false "avif_srcset" "/fixture-art.svg 1600w" "webp_srcset" "/fixture-art.svg 1600w" "fallback_url" "/fixture-art.svg" "intrinsic_width" 1600 "intrinsic_height" 900) }}');
  put("static/fixture-art.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#eadfcf"/><path d="M0 900L800 120L1600 900" fill="#b0a087"/></svg>');
  put("assets/css/main.css", fs.readFileSync(path.join(root, "assets/css/main.css")));
  put("assets/js/piece-share.js", fs.readFileSync(path.join(root, "assets/js/piece-share.js")));
  put("hugo.toml", 'baseURL="https://outsideinprint.org/"\ntimeZone="America/New_York"\ndisableKinds=["home","section","taxonomy","term","rss","sitemap"]\n[params.newsletter]\nprovider="disabled"\nbuttondown_username=""\n');
  const simple = (date, extra = {}) => ({ title: `Issue ${date}`, date, draft: false, url: `/almanack/${date}/`, issue_number: 1,
    bob_note: "Exact fixture note.", opening_quote: "Exact opening quote.", middle_quote: "Exact middle quote.", closing_quote: "Exact closing quote.",
    opening_quote_attribution: "Robert", middle_quote_attribution: "Poor Richard", closing_quote_attribution: "Robert",
    essays: [{ title: "Fixture article", url: "https://outsideinprint.org/essays/fixture/", description: "Exact article capsule." }],
    virtue: { name: "Fixture virtue", reflection: "Exact reflection." }, ...extra });
  put("content/almanack/2026-10-24.md", JSON.stringify(simple("2026-10-24")) + "\n\nExact source prose.\n");
  put("content/essays/fixture.md", JSON.stringify({ title: "Ordinary piece", date: "2026-10-24", draft: false, url: "/essays/fixture/" }) + "\n");
  put("content/almanack/2026-11-14.md", JSON.stringify(simple("2026-11-14", { draft: true })) + "\n");
  put("content/almanack/2026-10-17.md", JSON.stringify(simple("2026-10-17", { noindex: true })) + "\n");
  const approved = (date, source, body, css) => {
    put(`content/almanack/${date}.md`, source);
    put(`assets/almanack/${date}/body.html`, body);
    put(`assets/almanack/${date}/manifest.json`, JSON.stringify({ schema: "oip-almanack-web-fragment/v1", layout: "alternating-margins-v1", issue_date: date,
      issue_number: date === "2026-10-31" ? 26 : 27, staged_source_sha256: hash(source), fragment_sha256: hash(body), css_sha256: hash(css), managed_images: [] }));
  };
  const css = fs.readFileSync(path.join(root, "assets/css/almanack-alternating-v1.css"));
  put("assets/css/almanack-alternating-v1.css", css);
  // The protected current fragment is real. Native placeholders are resolved
  // through deterministic picture markup, without processing any originals.
  const currentSource = fs.readFileSync(path.join(root, "content/almanack/2026-10-31.md"));
  let currentBody = fs.readFileSync(path.join(root, "assets/almanack/2026-10-31/body.html"), "utf8");
  const currentManifest = JSON.parse(fs.readFileSync(path.join(root, "assets/almanack/2026-10-31/manifest.json")));
  // Keep native identity bindings in the actual approved-sheet partial.
  approved("2026-10-31", currentSource, currentBody, css);
  const manifestPath = path.join(site, "assets/almanack/2026-10-31/manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestPath)), managed_images: currentManifest.managed_images }));
  fs.cpSync(path.join(root, "static/images/almanack/2026-10-31"), path.join(site, "static/images/almanack/2026-10-31"), { recursive: true });
  const futureBody = '<h1 id="almanack-title">A future published issue</h1><p>Exact future protected copy.</p>';
  approved("2026-11-07", Buffer.from(JSON.stringify(simple("2026-11-07", { almanack_layout: "alternating-margins-v1", issue_number: 27 })) + "\n"), Buffer.from(futureBody), css);
  const shared = process.platform === "win32" ? path.join(os.homedir(), "Documents/30_Resources/toolchains/hugo/0.167.0/hugo.exe") : "hugo";
  const hugo = process.env.OIP_HUGO_BIN || shared;
  const run = (destination, clock, extra = []) => {
    execFileSync(hugo, ["--source", site, "--destination", path.join(site, destination), "--clock", clock, "--buildFuture", "--buildDrafts", "--panicOnWarning", ...extra], { encoding: "utf8", stdio: "pipe" });
  };
  run("before", "2026-10-31T20:00:00Z");
  run("public", "2026-11-08T20:00:00Z");
  run("local", "2026-11-08T20:00:00Z", ["--baseURL", "http://localhost:1313/"]);
  return { site, futureBody, currentBody, read: (mode, route) => fs.readFileSync(path.join(site, mode, route, "index.html"), "utf8") };
}
