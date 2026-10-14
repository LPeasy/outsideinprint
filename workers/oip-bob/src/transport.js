// One bounded upstream attempt. Only explicit safe metadata leaves this module.
export const API_URL = 'https://api.openai.com/v1/responses';
export const MAX_RESPONSE_BYTES = 1_048_576;
export const REQUEST_DEADLINE_MS = 15_000;
const QUOTA_CODES = new Set([
  'insufficient_quota', 'billing_hard_limit_reached', 'usage_limit_reached',
  'project_spend_limit_exceeded', 'organization_spend_limit_exceeded',
  'organization_usage_limit_exceeded', 'credit_balance_exhausted',
]);

export class BobError extends Error {
  constructor(status, message, code = 'service_error', retryable = true, requestId = null) {
    super(message);
    this.name = 'BobError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.requestId = safeRequestId(requestId);
    this.request_id = this.requestId; // Compatibility for callers migrating from the preview.
  }
}
export function safeRequestId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value) ? value : null; }
export function safeUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = {};
  for (const name of ['input_tokens', 'output_tokens', 'total_tokens']) if (Number.isSafeInteger(value[name]) && value[name] >= 0) result[name] = value[name];
  return Object.keys(result).length ? result : null;
}
export function emitDiagnostic(callback, metadata) {
  if (typeof callback !== 'function') return;
  const safe = { outcome: metadata.outcome, elapsedMs: Math.max(0, Math.round(metadata.elapsedMs || 0)), model: 'gpt-6-luna' };
  if (typeof metadata.code === 'string' && /^[a-z_]{1,80}$/.test(metadata.code)) safe.code = metadata.code;
  if (safeRequestId(metadata.requestId)) safe.requestId = metadata.requestId;
  if (safeUsage(metadata.usage)) safe.usage = safeUsage(metadata.usage);
  try { const pending = callback(safe); if (pending?.catch) pending.catch(() => {}); } catch { /* Telemetry cannot break a reading request. */ }
}

async function boundedText(response, maximum, requestId) {
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maximum) {
    await response.body?.cancel().catch(() => {});
    throw new BobError(502, 'Bob received an unreadable response. Please try again.', 'invalid_response_size', true, requestId);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel().catch(() => {});
        throw new BobError(502, 'Bob received an unreadable response. Please try again.', 'invalid_response_size', true, requestId);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function httpError(status, body, requestId) {
  const code = body && typeof body === 'object' && !Array.isArray(body) && body.error && typeof body.error === 'object' ? body.error.code : '';
  if (status === 429 && QUOTA_CODES.has(code)) return new BobError(503, 'Bob’s reading service has reached its usage limit. Please try later.', 'quota_exceeded', false, requestId);
  if (status === 429) return new BobError(503, 'Bob’s reading service is busy. Please try again shortly.', 'upstream_rate_limit', true, requestId);
  if (status === 401) return new BobError(503, 'Bob’s API connection needs attention. Please try later.', 'authentication', false, requestId);
  if ([403, 404].includes(status)) return new BobError(503, 'Bob’s reading service needs attention. Please try later.', 'model_access', false, requestId);
  if (status >= 500) return new BobError(502, 'Bob’s reading service is unavailable right now. Please try again.', 'upstream_unavailable', true, requestId);
  return new BobError(502, 'Bob could not complete that search. Please try later.', 'upstream_request', false, requestId);
}

export async function callOpenAI(payload, { apiKey, fetchImpl = globalThis.fetch, signal, timeoutMs = REQUEST_DEADLINE_MS, diagnostic, onDispatch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new BobError(503, 'Bob is not connected yet. Please try again shortly.', 'not_configured', false);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > REQUEST_DEADLINE_MS) throw new BobError(503, 'Bob’s reading service needs attention. Please try later.', 'service_configuration', false);
  if (signal?.aborted) throw new BobError(499, 'The reading request was cancelled.', 'cancelled', false);
  const started = Date.now(), controller = new AbortController();
  let timer, rejectDeadline, requestId = null;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const cancel = () => { controller.abort(); rejectDeadline(new BobError(499, 'The reading request was cancelled.', 'cancelled', false, requestId)); };
  signal?.addEventListener('abort', cancel, { once: true });
  timer = setTimeout(() => {
    controller.abort();
    rejectDeadline(new BobError(504, 'Bob took too long to reply. Please try again or edit your request.', 'timeout', true, requestId));
  }, timeoutMs);
  try {
    const run = async () => {
      onDispatch?.();
      const response = await fetchImpl(API_URL, {
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      requestId = safeRequestId(response.headers.get('x-request-id'));
      let body;
      try { body = JSON.parse(await boundedText(response, response.ok ? MAX_RESPONSE_BYTES : 16_384, requestId)); }
      catch (error) {
        if (!response.ok) throw httpError(response.status, null, requestId);
        if (error instanceof BobError) throw error;
        throw new BobError(502, 'Bob received an unreadable response. Please try again.', 'invalid_response_json', true, requestId);
      }
      if (!response.ok) throw httpError(response.status, body, requestId);
      return { response: body, requestId, usage: safeUsage(body?.usage) };
    };
    const result = await Promise.race([run(), deadline]);
    emitDiagnostic(diagnostic, { outcome: 'response_received', elapsedMs: Date.now() - started, requestId, usage: result.usage });
    return result;
  } catch (error) {
    const safe = error instanceof BobError ? error : new BobError(502, 'Bob’s reading service could not be reached. Please try again.', 'connection', true, requestId);
    emitDiagnostic(diagnostic, { outcome: 'transport_error', elapsedMs: Date.now() - started, code: safe.code, requestId: safe.requestId });
    throw safe;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
