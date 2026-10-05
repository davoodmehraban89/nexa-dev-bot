const encoder = new TextEncoder();
const SIGNING_DOMAIN = 'nexa-approval-v1';
const INTENT_ID_PATTERN = /^[A-Za-z0-9_-]{8}$/;
const FULL_SHA_PATTERN = /^[a-f0-9]{40}$/i;

const DEFAULT_CODECS = new Map([
  ['github.workflow.run.rerun_failed', { code: 'r', pluginId: 'github', risk: 'WRITE', target: 'run' }],
  ['github.workflow.run.cancel', { code: 'c', pluginId: 'github', risk: 'WRITE', target: 'run' }],
  ['github.workspace.commit_branch', { code: 'e', pluginId: 'github', risk: 'WRITE', target: 'intent' }],
  ['github.pull_request.merge', { code: 'm', pluginId: 'github', risk: 'DESTRUCTIVE', target: 'prhead' }]
]);

const bytesToBase64Url = bytes => { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); };
const base64UrlToBytes = value => { const normalized = value.replace(/-/g, '+').replace(/_/g, '/'); const padding = '='.repeat((4 - (normalized.length % 4)) % 4); const binary = atob(normalized + padding); return Uint8Array.from(binary, char => char.charCodeAt(0)); };
const textToBase64Url = value => bytesToBase64Url(encoder.encode(value));
const base64UrlToText = value => new TextDecoder().decode(base64UrlToBytes(value));
const toBase36Int = value => { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid approval numeric input'); return number.toString(36); };
const fromBase36Int = value => { if (!/^[0-9a-z]+$/i.test(value)) throw new Error('Invalid approval numeric input'); const number = Number.parseInt(value, 36); if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid approval numeric input'); return number; };
const constantTimeEqual = (left, right) => { if (left.length !== right.length) return false; let mismatch = 0; for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index]; return mismatch === 0; };
const compactCodecFor = actionId => DEFAULT_CODECS.get(actionId) || null;
const compactCodecByCode = code => { for (const [actionId, codec] of DEFAULT_CODECS.entries()) if (codec.code === code) return { actionId, ...codec }; return null; };

export class ApprovalService {
  constructor({ secret = '', now = () => Date.now(), ttlMs = 120_000, maxTokenLength = 56, signatureBytes = 12, replayStore = null } = {}) {
    this.secret = String(secret || ''); this.now = now; this.ttlMs = ttlMs; this.maxTokenLength = maxTokenLength; this.signatureBytes = signatureBytes;
    if (replayStore && typeof replayStore.consume !== 'function') throw new Error('Approval replay store is invalid');
    this.replayStore = replayStore; this.keyPromise = null;
  }
  isReplayProtected() { return Boolean(this.replayStore && typeof this.replayStore.consume === 'function'); }
  async issue(payload = {}) {
    this.#assertSecret(); const issuedAt = this.now(); const expiresAt = issuedAt + this.ttlMs; const nonce = this.#nonce();
    const normalized = { v: 1, pluginId: payload.pluginId, actionId: payload.actionId, risk: payload.risk, ownerId: String(payload.ownerId ?? ''), input: payload.input ?? {}, issuedAt, expiresAt, nonce };
    if (!normalized.ownerId) throw new Error('Approval owner is required');
    const body = this.#encodeBody(normalized); const signature = await this.#sign(normalized.ownerId, body); const token = `${body}.${bytesToBase64Url(signature.slice(0, this.signatureBytes))}`;
    if (token.length > this.maxTokenLength) throw new Error('Approval token too large for callback data'); return token;
  }
  async verify(token, expectations = {}) {
    this.#assertSecret(); if (!token || typeof token !== 'string') throw new Error('Invalid approval token'); const ownerId = String(expectations.ownerId ?? ''); if (!ownerId) throw new Error('Approval owner is required');
    const parts = token.split('.'); if (parts.length < 3) throw new Error('Invalid approval token'); const signaturePart = parts.pop(); const body = parts.join('.'); let suppliedSignature;
    try { suppliedSignature = base64UrlToBytes(signaturePart); } catch { throw new Error('Invalid approval signature'); }
    const expectedSignature = (await this.#sign(ownerId, body)).slice(0, this.signatureBytes); if (!constantTimeEqual(suppliedSignature, expectedSignature)) throw new Error('Invalid approval signature or owner mismatch');
    const payload = this.#decodeBody(body, ownerId); if (payload.expiresAt < this.now()) throw new Error('Approval token expired');
    if (expectations.pluginId && payload.pluginId !== expectations.pluginId) throw new Error('Approval plugin mismatch');
    if (expectations.actionId && payload.actionId !== expectations.actionId) throw new Error('Approval action mismatch');
    if (expectations.risk && payload.risk !== expectations.risk) throw new Error('Approval risk mismatch'); return payload;
  }
  async consume(token, expectations = {}) {
    const payload = await this.verify(token, expectations); if (!this.isReplayProtected()) throw new Error('Durable approval replay protection is not configured');
    const accepted = await this.replayStore.consume({ ownerId: payload.ownerId, nonce: payload.nonce, expiresAt: payload.expiresAt }); if (!accepted) throw new Error('Approval token already used'); return payload;
  }
  #encodeBody(payload) {
    const codec = compactCodecFor(payload.actionId); const repoId = payload.input?.repoId;
    if (codec && codec.pluginId === payload.pluginId && codec.risk === payload.risk && Number.isSafeInteger(Number(repoId))) {
      let target;
      if (codec.target === 'run') { const runId = payload.input?.runId; if (!Number.isSafeInteger(Number(runId))) return `j.${textToBase64Url(JSON.stringify(payload))}`; target = toBase36Int(runId); }
      else if (codec.target === 'intent') { const intentId = String(payload.input?.intentId || ''); if (!INTENT_ID_PATTERN.test(intentId)) throw new Error('Invalid approval intent ID'); target = intentId; }
      else if (codec.target === 'prhead') { const prNumber = payload.input?.prNumber; const headSha = String(payload.input?.headSha || ''); if (!Number.isSafeInteger(Number(prNumber)) || !FULL_SHA_PATTERN.test(headSha)) throw new Error('Invalid pull request approval target'); target = `${toBase36Int(prNumber)}~${headSha}`; }
      else return `j.${textToBase64Url(JSON.stringify(payload))}`;
      return ['1', codec.code, toBase36Int(repoId), target, toBase36Int(payload.expiresAt), payload.nonce].join('.');
    }
    return `j.${textToBase64Url(JSON.stringify(payload))}`;
  }
  #decodeBody(body, ownerId) {
    if (body.startsWith('j.')) { let payload; try { payload = JSON.parse(base64UrlToText(body.slice(2))); } catch { throw new Error('Invalid approval payload'); } if (String(payload.ownerId ?? '') !== ownerId) throw new Error('Approval owner mismatch'); return payload; }
    const parts = body.split('.'); if (parts.length !== 6 || parts[0] !== '1') throw new Error('Invalid approval payload'); const [, code, repoPart, targetPart, expiryPart, nonce] = parts; const codec = compactCodecByCode(code); if (!codec) throw new Error('Invalid approval action'); const expiresAt = fromBase36Int(expiryPart); const input = { repoId: fromBase36Int(repoPart) };
    if (codec.target === 'run') input.runId = fromBase36Int(targetPart);
    else if (codec.target === 'intent') { if (!INTENT_ID_PATTERN.test(targetPart)) throw new Error('Invalid approval intent ID'); input.intentId = targetPart; }
    else if (codec.target === 'prhead') { const [prPart, headSha, extra] = targetPart.split('~'); if (extra !== undefined || !FULL_SHA_PATTERN.test(headSha || '')) throw new Error('Invalid pull request approval target'); input.prNumber = fromBase36Int(prPart); input.headSha = headSha; }
    else throw new Error('Invalid approval target');
    return { v: 1, pluginId: codec.pluginId, actionId: codec.actionId, risk: codec.risk, ownerId, input, issuedAt: expiresAt - this.ttlMs, expiresAt, nonce };
  }
  async #sign(ownerId, body) { const key = await this.#key(); const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${SIGNING_DOMAIN}|${ownerId}|${body}`)); return new Uint8Array(signature); }
  async #key() { if (!this.keyPromise) this.keyPromise = crypto.subtle.importKey('raw', encoder.encode(this.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return this.keyPromise; }
  #nonce() { const bytes = new Uint8Array(6); crypto.getRandomValues(bytes); return bytesToBase64Url(bytes); }
  #assertSecret() { if (!this.secret) throw new Error('Approval signing secret is required'); }
}
