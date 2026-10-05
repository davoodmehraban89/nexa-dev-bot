const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(secret) {
  const normalized = String(secret || '').replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  if (!normalized) throw new Error('TOTP secret is not configured');
  let bits = '';
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('TOTP secret is invalid');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  if (!bytes.length) throw new Error('TOTP secret is invalid');
  return new Uint8Array(bytes);
}

function counterBytes(counter) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  return buffer;
}

function constantTimeCodeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

export class TotpVerifier {
  constructor({ secret = '', now = () => Date.now(), periodMs = 30_000, digits = 6, window = 1 } = {}) {
    this.secret = String(secret || '');
    this.now = now;
    this.periodMs = periodMs;
    this.digits = digits;
    this.window = window;
    this.keyPromise = null;
  }

  isConfigured() {
    return Boolean(this.secret.trim());
  }

  async verify(code) {
    if (!this.isConfigured()) throw new Error('Destructive second factor is not configured');
    const supplied = String(code || '').trim();
    if (!new RegExp(`^\\d{${this.digits}}$`).test(supplied)) return false;
    const currentCounter = Math.floor(this.now() / this.periodMs);
    for (let delta = -this.window; delta <= this.window; delta += 1) {
      if (constantTimeCodeEqual(supplied, await this.#generate(currentCounter + delta))) return true;
    }
    return false;
  }

  async #generate(counter) {
    if (!Number.isSafeInteger(counter) || counter < 0) return '';
    const key = await this.#key();
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes(counter)));
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24)
      | (digest[offset + 1] << 16)
      | (digest[offset + 2] << 8)
      | digest[offset + 3];
    return String(binary % (10 ** this.digits)).padStart(this.digits, '0');
  }

  async #key() {
    if (!this.keyPromise) {
      this.keyPromise = crypto.subtle.importKey(
        'raw',
        decodeBase32(this.secret),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );
    }
    return this.keyPromise;
  }
}
