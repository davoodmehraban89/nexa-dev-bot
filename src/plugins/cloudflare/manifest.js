export const cloudflarePluginManifest = Object.freeze({
  id: 'cloudflare',
  name: 'Cloudflare',
  version: 1,
  commands: Object.freeze([]),
  actions: Object.freeze({
    'cloudflare.worker.status': Object.freeze({ risk: 'READ' }),
    'cloudflare.worker.versions': Object.freeze({ risk: 'READ' }),
    'cloudflare.worker.deploy_version': Object.freeze({ risk: 'DESTRUCTIVE' })
  })
});
