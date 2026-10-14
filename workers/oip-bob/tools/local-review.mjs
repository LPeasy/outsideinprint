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
const mf = new Miniflare({
  host: '127.0.0.1', port: 8787, log: new Log(LogLevel.WARN),
  modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
  scriptPath: path.join(root, 'src/index.js'), compatibilityDate: '2026-07-30',
  durableObjects: { BOB_BUDGET: { className: 'BobBudget', useSQLite: true } },
  durableObjectsPersist: path.join(root, '.wrangler/local-review'),
  bindings: {
    ENVIRONMENT: 'local', CHAT_ENABLED: 'true',
    ALLOWED_ORIGINS: 'http://127.0.0.1:8769,http://localhost:8769',
    CATALOG_URL: 'http://127.0.0.1:8769/companion-bob/catalog.json',
    OPENAI_API_KEY: values.OPENAI_API_KEY,
    IP_HASH_SECRET: 'local-review-only-no-production-identity',
    DAILY_BUDGET_MICROUSD: '500000', MONTHLY_BUDGET_MICROUSD: '5000000',
  },
});
await mf.ready;
console.log('Bob Worker review API listening at http://127.0.0.1:8787 (live OpenAI calls; local deployment only).');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await mf.dispose(); process.exit(0); });
