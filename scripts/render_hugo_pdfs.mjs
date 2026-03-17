import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"]
]);

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      args[value.slice(2)] = true;
      continue;
    }

    args[value.slice(2)] = nextValue;
    index += 1;
  }
  return args;
}

export async function serveStatic(rootDir, requestedPort) {
  const safeRoot = path.resolve(rootDir);
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      let relativePath = decodeURIComponent(requestUrl.pathname);
      if (relativePath.endsWith("/")) {
        relativePath = `${relativePath}index.html`;
      }

      const candidate = path.resolve(safeRoot, `.${relativePath}`);
      if (!candidate.startsWith(safeRoot)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const filePath = candidate;
      const buffer = await fs.readFile(filePath);
      const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(buffer);
    } catch (error) {
      const status = error && error.code === "ENOENT" ? 404 : 500;
      response.writeHead(status).end(status === 404 ? "Not found" : "Server error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", resolve);
  });

  return server;
}

async function waitForPageReady(page, timeoutMs) {
  await page.waitForLoadState("networkidle", { timeout: timeoutMs });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await Promise.all(
      Array.from(document.images, (image) => {
        if (image.complete) {
          return null;
        }

        return new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", () => reject(new Error(`Image failed to load: ${image.currentSrc || image.src}`)), { once: true });
        });
      })
    );
  });
}

function buildRenderableUrl(baseUrl, route) {
  return new URL(route.startsWith("/") ? route.slice(1) : route, baseUrl).toString();
}

function formatRendererError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Executable doesn't exist/i.test(message)) {
    return `${message} Run 'npx playwright install chromium'.`;
  }
  return message;
}

export async function renderPdfBatch(manifest) {
  const server = await serveStatic(manifest.outputDir, new URL(manifest.baseUrl).port);
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: manifest.viewport || { width: 1400, height: 1900 }
    });
    const allowedOrigin = new URL(manifest.baseUrl).origin;

    await context.route("**/*", async (route) => {
      const targetUrl = route.request().url();
      if (targetUrl.startsWith("data:") || targetUrl.startsWith("blob:")) {
        await route.continue();
        return;
      }

      if (new URL(targetUrl).origin === allowedOrigin) {
        await route.continue();
        return;
      }

      await route.abort("blockedbyclient");
    });

    const results = [];
    for (const job of manifest.jobs || []) {
      const page = await context.newPage();
      const url = buildRenderableUrl(manifest.baseUrl, job.route);
      try {
        await page.emulateMedia({ media: "print" });
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: manifest.timeoutMs || 45000 });
        if (job.waitForSelector) {
          await page.waitForSelector(job.waitForSelector, { state: "visible", timeout: manifest.timeoutMs || 45000 });
        }
        await waitForPageReady(page, manifest.timeoutMs || 45000);
        await page.pdf({
          ...(manifest.pdf || {}),
          displayHeaderFooter: false,
          path: job.outputPath
        });
        results.push({ slug: job.slug, ok: true, route: job.route, url });
      } catch (error) {
        results.push({ slug: job.slug, ok: false, route: job.route, url, error: formatRendererError(error) });
      } finally {
        await page.close();
      }
    }

    await context.close();
    return { results };
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

export async function probePlaywright() {
  const browser = await chromium.launch({ headless: true });
  await browser.close();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.probe) {
    await probePlaywright();
    return;
  }

  if (!args.manifest) {
    throw new Error("Missing --manifest <path>.");
  }

  const manifest = JSON.parse(await fs.readFile(path.resolve(args.manifest), "utf8"));
  const results = await renderPdfBatch(manifest);

  if (args.results) {
    await fs.writeFile(path.resolve(args.results), `${JSON.stringify(results, null, 2)}\n`, "utf8");
  } else {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  }

  if (results.results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${formatRendererError(error)}\n`);
    process.exitCode = 1;
  });
}
