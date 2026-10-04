export const cloudflarePluginManifest = Object.freeze({
  id: 'cloudflare',
  name: 'Cloudflare',
  version: 1,
  commands: Object.freeze([]),
  actions: Object.freeze({
    'cloudflare.worker.status': Object.freeze({ risk: 'READ' })
  })
});
