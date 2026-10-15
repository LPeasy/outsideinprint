// Starts only a loopback Workers runtime. Reads the previously authorized env
// file into memory; never copies or prints credentials and never deploys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Log, LogLevel } from 'miniflare';

const args = process.argv.slice(2);
const get = flag => args[args.indexOf(flag) + 1];
if (!args.includes('--allow-live') || !args.includes('--env-file')) {
  console.error('Use --allow-live --env-file <already-approved-env-file> to start the local review API.'); process.exit(1);
}
const envPath = path.resolve(get('--env-file'));
const stat = fs.lstatSync(envPath);
if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected an approved regular env file.');
const values = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).flatMap(line => {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
}));
if (!values.OPENAI_API_KEY) throw new Error('The approved env file has no API key.');
const root = fileURLToPath(new URL('..', import.meta.url));
const port = args.includes('--port') ? Number(get('--port')) : 8787;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Expected a loopback port between 1024 and 65535.');
const site = new URL(args.includes('--site-origin') ? get('--site-origin') : 'http://127.0.0.1:8769');
if (site.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(site.hostname) || site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw new Error('Expected a loopback HTTP site origin.');
// Reuse an existing local ledger when reviewing another source worktree. Never
// reset the approved allowance by silently creating a new ledger per restart.
const persist = args.includes('--persist-dir') ? path.resolve(get('--persist-dir')) : path.join(root, '.wrangler/local-review');
const mf = new Miniflare({
  host: '127.0.0.1', port, log: new Log(LogLevel.WARN),
  modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
  scriptPath: path.join(root, 'src/index.js'), compatibilityDate: '2026-07-30',
  durableObjects: { BOB_BUDGET: { className: 'BobBudget', useSQLite: true } },
  durableObjectsPersist: persist,
  bindings: {
    ENVIRONMENT: 'local', CHAT_ENABLED: 'true',
    ALLOWED_ORIGINS: site.origin,
    CATALOG_URL: new URL('/companion-bob/catalog.json', site).href,
    OPENAI_API_KEY: values.OPENAI_API_KEY,
    IP_HASH_SECRET: 'local-review-only-no-production-identity',
    DAILY_BUDGET_MICROUSD: '500000', MONTHLY_BUDGET_MICROUSD: '5000000',
  },
});
await mf.ready;
console.log(`Bob Worker review API listening at http://127.0.0.1:${port} (live OpenAI calls; local deployment only).`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await mf.dispose(); process.exit(0); });
