export class PluginRouter {
  constructor({ registry, policy, audit } = {}) {
    if (!registry) throw new Error('PluginRouter registry is required');
    if (!policy) throw new Error('PluginRouter policy is required');
    if (!audit) throw new Error('PluginRouter audit logger is required');

    this.registry = registry;
    this.policy = policy;
    this.audit = audit;
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
      const action = registeredAction?.pluginId === pluginId ? registeredAction : null;
      const decision = this.policy.evaluate({
        action,
        isOwner: context.isOwner === true,
        approved: context.approved === true
      });

      this.audit.log({
        event: 'action_attempt',
        pluginId,
        actionId,
        risk: decision.risk,
        outcome: decision.allowed
          ? 'allowed'
          : (decision.requiresApproval ? 'approval_required' : 'denied'),
        reason: decision.reason
      });

      if (!decision.allowed) {
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
      }

      if (typeof route.execute !== 'function') {
        throw new Error(`Plugin route execute function is required for ${actionId}`);
      }

      try {
        const result = await route.execute();
        this.audit.log({
          event: 'action_result',
          pluginId,
          actionId,
          risk: decision.risk,
          outcome: 'success'
        });
        return result;
      } catch (error) {
        this.audit.log({
          event: 'action_result',
          pluginId,
          actionId,
          risk: decision.risk,
          outcome: 'error',
          error: error?.message || 'Unknown plugin error'
        });
        throw error;
      }
    }

    return null;
  }
}
