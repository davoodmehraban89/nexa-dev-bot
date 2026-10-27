const ALLOWED_RISKS = new Set(['READ', 'WRITE', 'DESTRUCTIVE']);

export class PluginRegistry {
  constructor(plugins = []) {
    this.plugins = [];
    this.pluginsById = new Map();
    this.actionsById = new Map();

    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  register(plugin) {
    const pluginId = plugin?.manifest?.id;
    if (!pluginId) {
      throw new Error('Plugin manifest id is required');
    }
    if (this.pluginsById.has(pluginId)) {
      throw new Error(`Duplicate plugin id: ${pluginId}`);
    }

    const actions = plugin.manifest.actions || {};
    for (const [actionId, descriptor] of Object.entries(actions)) {
      if (this.actionsById.has(actionId)) {
        throw new Error(`Duplicate action id: ${actionId}`);
      }
      if (!ALLOWED_RISKS.has(descriptor?.risk)) {
        throw new Error(
          `Invalid action risk for ${actionId}: ${descriptor?.risk}`
        );
      }
    }

    this.plugins.push(plugin);
    this.pluginsById.set(pluginId, plugin);

    for (const [actionId, descriptor] of Object.entries(actions)) {
      this.actionsById.set(
        actionId,
        Object.freeze({
          pluginId,
          actionId,
          risk: descriptor.risk
        })
      );
    }
  }

  getPlugins() {
    return [...this.plugins];
  }

  getPlugin(pluginId) {
    return this.pluginsById.get(pluginId) || null;
  }

  getAction(actionId) {
    return this.actionsById.get(actionId) || null;
  }
}
