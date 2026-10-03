export const githubPluginManifest = Object.freeze({
  id: 'github',
  name: 'GitHub',
  version: 2,
  commands: Object.freeze(['/repos']),
  actions: Object.freeze({
    'github.repos.list': Object.freeze({ risk: 'READ' }),
    'github.repo.detail': Object.freeze({ risk: 'READ' }),
    'github.files.list': Object.freeze({ risk: 'READ' }),
    'github.tree.read': Object.freeze({ risk: 'READ' }),
    'github.blob.read': Object.freeze({ risk: 'READ' }),
    'github.pr.list': Object.freeze({ risk: 'READ' }),
    'github.commits.list': Object.freeze({ risk: 'READ' }),
    'github.status.read': Object.freeze({ risk: 'READ' }),
    'github.workflow.runs.list': Object.freeze({ risk: 'READ' }),
    'github.workflow.run.detail': Object.freeze({ risk: 'READ' }),
    'github.workflow.jobs.list': Object.freeze({ risk: 'READ' }),
    'github.workflow.run.rerun_failed': Object.freeze({ risk: 'WRITE' }),
    'github.workflow.run.cancel': Object.freeze({ risk: 'WRITE' })
  })
});
