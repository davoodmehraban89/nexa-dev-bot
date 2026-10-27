const AUDIT_METADATA_KEYS = Object.freeze(
  new Set([
    'repoId',
    'workspaceId',
    'intentId',
    'path',
    'contentDigest',
    'commitMessageDigest',
    'baseHeadSha',
    'targetBranch',
    'commitSha',
    'branch',
    'idempotent'
  ])
);
function sanitizeAuditMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const safe = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!AUDIT_METADATA_KEYS.has(key)) continue;
    if (typeof raw === 'number' && Number.isSafeInteger(raw)) {
      safe[key] = raw;
      continue;
    }
    if (typeof raw === 'boolean') {
      safe[key] = raw;
      continue;
    }
    if (typeof raw === 'string') safe[key] = raw.slice(0, 240);
  }
  return safe;
}
function withoutAuditMetadata(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    !Object.hasOwn(result, 'audit')
  )
    return result;
  const { audit, ...publicResult } = result;
  return publicResult;
}
export class PluginRouter {
  constructor({ registry, policy, audit, killSwitch = null } = {}) {
    if (!registry) throw new Error('PluginRouter registry is required');
    if (!policy) throw new Error('PluginRouter policy is required');
    if (!audit) throw new Error('PluginRouter audit logger is required');
    this.registry = registry;
    this.policy = policy;
    this.audit = audit;
    this.killSwitch = killSwitch;
  }
  async dispatchCommand(command, context = {}) {
    return this.#dispatch('resolveCommand', command, context);
  }
  async dispatchCallback(data, context = {}) {
    return this.#dispatch('resolveCallback', data, context);
  }
  async dispatchMessage(payload, context = {}) {
    return this.#dispatch('resolveMessage', payload, context);
  }
  async #dispatch(resolverName, input, context) {
    for (const plugin of this.registry.getPlugins()) {
      const resolver = plugin?.[resolverName];
      if (typeof resolver !== 'function') continue;
      const route = await resolver.call(plugin, input, context);
      if (!route) continue;
      const pluginId = plugin.manifest.id;
      const actionId = route.actionId;
      const registeredAction = this.registry.getAction(actionId);
      const action =
        registeredAction?.pluginId === pluginId ? registeredAction : null;
      const decision = this.policy.evaluate({
        action,
        isOwner: context.isOwner === true,
        approved: context.approved === true
      });
      const routeAudit = sanitizeAuditMetadata(route.audit);
      this.audit.log({
        event: 'action_attempt',
        pluginId,
        actionId,
        risk: decision.risk,
        outcome: decision.allowed
          ? 'allowed'
          : decision.requiresApproval
            ? 'approval_required'
            : 'denied',
        reason: decision.reason,
        ...routeAudit
      });
      if (!decision.allowed)
        return {
          ok: false,
          pluginId,
          actionId,
          risk: decision.risk,
          requiresApproval: decision.requiresApproval,
          denied: !decision.requiresApproval,
          reason: decision.reason,
          approval: route.approval || null
        };
      if (this.killSwitch && (await this.killSwitch.blocks(decision.risk))) {
        this.audit.log({
          event: 'kill_switch_block',
          pluginId,
          actionId,
          risk: decision.risk,
          outcome: 'denied'
        });
        return {
          ok: false,
          pluginId,
          actionId,
          risk: decision.risk,
          requiresApproval: false,
          denied: true,
          killSwitchLocked: true,
          reason: 'Emergency kill switch is locked'
        };
      }
      if (typeof route.execute !== 'function')
        throw new Error(
          `Plugin route execute function is required for ${actionId}`
        );
      try {
        const result = await route.execute();
        this.audit.log({
          event: 'action_result',
          pluginId,
          actionId,
          risk: decision.risk,
          outcome: 'success',
          ...routeAudit,
          ...sanitizeAuditMetadata(result?.audit)
        });
        return withoutAuditMetadata(result);
      } catch (error) {
        this.audit.log({
          event: 'action_result',
          pluginId,
          actionId,
          risk: decision.risk,
          outcome: 'error',
          error: error?.message || 'Unknown plugin error',
          ...routeAudit
        });
        throw error;
      }
    }
    return null;
  }
}
