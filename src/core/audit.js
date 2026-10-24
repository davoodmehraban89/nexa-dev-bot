function redactString(value, secrets) {
  let result = value;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join('[REDACTED]');
  }
  return result;
}

function sanitize(value, secrets) {
  if (typeof value === 'string') return redactString(value, secrets);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        sanitize(nested, secrets)
      ])
    );
  }
  return value;
}

export class AuditLogger {
  constructor({ secrets = [], sink } = {}) {
    this.secrets = secrets.map((value) => String(value || '')).filter(Boolean);
    this.sink =
      sink || ((event) => console.log('nexa_audit', JSON.stringify(event)));
  }

  log(event) {
    const sanitized = sanitize(event, this.secrets);
    try {
      this.sink(sanitized);
    } catch {
      // Audit is best-effort in Foundation v1 and must never break a user action.
    }
    return sanitized;
  }
}
