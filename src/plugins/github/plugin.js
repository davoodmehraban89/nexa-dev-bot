import { githubPluginManifest } from './manifest.js';

const CALLBACK_ACTIONS = Object.freeze([
  ['repo:', 'github.repo.detail'],
  ['files:', 'github.files.list'],
  ['tree:', 'github.tree.read'],
  ['blob:', 'github.blob.read'],
  ['pr:', 'github.pr.list'],
  ['commits:', 'github.commits.list'],
  ['status:', 'github.status.read']
]);

function resolveCallbackAction(data) {
  const value = String(data || '');
  if (value === 'menu:repos') return 'github.repos.list';

  for (const [prefix, actionId] of CALLBACK_ACTIONS) {
    if (value.startsWith(prefix)) return actionId;
  }

  return null;
}

export function createGitHubPlugin({ github, menu } = {}) {
  if (!github) throw new Error('GitHub plugin requires github service');
  if (!menu) throw new Error('GitHub plugin requires menu manager');

  return {
    manifest: githubPluginManifest,

    resolveCommand(command) {
      if (command !== '/repos') return null;
      return {
        actionId: 'github.repos.list',
        execute: () => menu.getReposListView()
      };
    },

    resolveCallback(data) {
      const actionId = resolveCallbackAction(data);
      if (!actionId) return null;

      return {
        actionId,
        execute: () => menu.renderByCallback(data)
      };
    }
  };
}
