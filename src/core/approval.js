const encoder = new TextEncoder();

// Shared within a Worker isolate so approval replay state survives across
// separate NexaDevBot instances created for individual webhook requests.
// A durable cross-isolate store is wired in the hardening phase.
const sharedUsedNonces = new Set();

const DEFAULT_CODECS = new Map([
  ['github.workflow.run.rerun_failed', {
    code: 'r',
    pluginId: 'github',
    risk: 'WRITE'
  }],
  ['github.workflow.run.cancel', {
    code: 'c',
    pluginId: 'github',
    risk: 'WRITE'
  }]
]);

const bytesToBase64Url = bytes => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const base64UrlToBytes = value => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const textToBase64Url = value => bytesToBase64Url(encoder.encode(value));
const base64UrlToText = value => new TextDecoder().decode(base64UrlToBytes(value));

const toBase36Int = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid approval numeric input');
  return number.toString(36);
};

const fromBase36Int = value => {
  if (!/^[0-9a-z]+$/i.test(value)) throw new Error('Invalid approval numeric input');
  const number = Number.parseInt(value, 36);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid approval numeric input');
  return number;
};

const constantTimeEqual = (left, right) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
};

const compactCodecFor = actionId => DEFAULT_CODECS.get(actionId) || null;
const compactCodecByCode = code => {
  for (const [actionId, codec] of DEFAULT_CODECS.entries()) {
    if (codec.code === code) return { actionId, ...codec };
  }
  return null;
};

export class ApprovalService {
  constructor({
    secret = '',
    now = () => Date.now(),
    ttlMs = 120_000,
    maxTokenLength = 56,
    signatureBytes = 12,
    replayStore = sharedUsedNonces
  } = {}) {
    this.secret = String(secret || '');
    this.now = now;
    this.ttlMs = ttlMs;
    this.maxTokenLength = maxTokenLength;
    this.signatureBytes = signatureBytes;
    if (!replayStore || typeof replayStore.has !== 'function' || typeof replayStore.add !== 'function') {
      throw new Error('Approval replay store is invalid');
    }
    this.replayStore = replayStore;
    this.keyPromise = null;
  }

  async issue(payload = {}) {
    this.#assertSecret();
    const issuedAt = this.now();
    const expiresAt = issuedAt + this.ttlMs;
    const nonce = this.#nonce();
    const normalized = {
      v: 1,
      pluginId: payload.pluginId,
      actionId: payload.actionId,
      risk: payload.risk,
      ownerId: String(payload.ownerId ?? ''),
      input: payload.input ?? {},
      issuedAt,
      expiresAt,
      nonce
    };

    if (!normalized.ownerId) throw new Error('Approval owner is required');

    const body = this.#encodeBody(normalized);
    const signature = await this.#sign(normalized.ownerId, body);
    const token = `${body}.${bytesToBase64Url(signature.slice(0, this.signatureBytes))}`;
    if (token.length > this.maxTokenLength) throw new Error('Approval token too large for callback data');
    return token;
  }

  async verify(token, expectations = {}) {
    this.#assertSecret();
    if (!token || typeof token !== 'string') throw new Error('Invalid approval token');
    const ownerId = String(expectations.ownerId ?? '');
    if (!ownerId) throw new Error('Approval owner is required');

    const parts = token.split('.');
    if (parts.length < 3) throw new Error('Invalid approval token');
    const signaturePart = parts.pop();
    const body = parts.join('.');

    let suppliedSignature;
    try {
      suppliedSignature = base64UrlToBytes(signaturePart);
    } catch {
      throw new Error('Invalid approval signature');
    }

    const expectedSignature = (await this.#sign(ownerId, body)).slice(0, this.signatureBytes);
    if (!constantTimeEqual(suppliedSignature, expectedSignature)) {
      throw new Error('Invalid approval signature or owner mismatch');
    }

    const payload = this.#decodeBody(body, ownerId);
    if (payload.expiresAt < this.now()) throw new Error('Approval token expired');
    if (expectations.pluginId && payload.pluginId !== expectations.pluginId) throw new Error('Approval plugin mismatch');
    if (expectations.actionId && payload.actionId !== expectations.actionId) throw new Error('Approval action mismatch');
    if (expectations.risk && payload.risk !== expectations.risk) throw new Error('Approval risk mismatch');
    return payload;
  }

  async consume(token, expectations = {}) {
    const payload = await this.verify(token, expectations);
    if (this.replayStore.has(payload.nonce)) throw new Error('Approval token already used');
    this.replayStore.add(payload.nonce);
    return payload;
  }

  #encodeBody(payload) {
    const codec = compactCodecFor(payload.actionId);
    const repoId = payload.input?.repoId;
    const runId = payload.input?.runId;
    if (
      codec &&
      codec.pluginId === payload.pluginId &&
      codec.risk === payload.risk &&
      Number.isSafeInteger(Number(repoId)) &&
      Number.isSafeInteger(Number(runId))
    ) {
      return [
        '1',
        codec.code,
        toBase36Int(repoId),
        toBase36Int(runId),
        toBase36Int(payload.expiresAt),
        payload.nonce
      ].join('.');
    }

    return `j.${textToBase64Url(JSON.stringify(payload))}`;
  }

  #decodeBody(body, ownerId) {
    if (body.startsWith('j.')) {
      let payload;
      try {
        payload = JSON.parse(base64UrlToText(body.slice(2)));
      } catch {
        throw new Error('Invalid approval payload');
      }
      if (String(payload.ownerId ?? '') !== ownerId) throw new Error('Approval owner mismatch');
      return payload;
    }

    const parts = body.split('.');
    if (parts.length !== 6 || parts[0] !== '1') throw new Error('Invalid approval payload');
    const [, code, repoPart, runPart, expiryPart, nonce] = parts;
    const codec = compactCodecByCode(code);
    if (!codec) throw new Error('Invalid approval action');
    const expiresAt = fromBase36Int(expiryPart);
    return {
      v: 1,
      pluginId: codec.pluginId,
      actionId: codec.actionId,
      risk: codec.risk,
      ownerId,
      input: {
        repoId: fromBase36Int(repoPart),
        runId: fromBase36Int(runPart)
      },
      issuedAt: expiresAt - this.ttlMs,
      expiresAt,
      nonce
    };
  }

  async #sign(ownerId, body) {
    const key = await this.#key();
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${ownerId}|${body}`)
    );
    return new Uint8Array(signature);
  }

  async #key() {
    if (!this.keyPromise) {
      this.keyPromise = crypto.subtle.importKey(
        'raw',
        encoder.encode(this.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
    }
    return this.keyPromise;
  }

  #nonce() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  #assertSecret() {
    if (!this.secret) throw new Error('Approval signing secret is required');
  }
}
