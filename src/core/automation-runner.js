import { transitionAutomation } from './automation.js';
export class AutomationRunner {
  constructor({ router, store, killSwitch = null }) {
    this.router = router;
    this.store = store;
    this.killSwitch = killSwitch;
  }
  async advance(state) {
    if (this.killSwitch && (await this.killSwitch.automationBlocked())) {
      const next = {
        ...structuredClone(state),
        status: 'paused_kill_switch',
        updatedAt: Date.now()
      };
      await this.store.put(next);
      return next;
    }
    const step = state.steps[state.cursor];
    if (!step) return state;
    const routed = await this.router.dispatchCallback(step.callback, {
      isOwner: true,
      ownerId: state.ownerId
    });
    if (!routed) throw new Error('Automation action unavailable');
    if (routed.killSwitchLocked) {
      const next = {
        ...structuredClone(state),
        status: 'paused_kill_switch',
        updatedAt: Date.now()
      };
      await this.store.put(next);
      return next;
    }
    if (routed.requiresApproval) {
      const next = transitionAutomation(state, {
        type: 'pause',
        intent: {
          pluginId: routed.pluginId,
          actionId: routed.actionId,
          risk: routed.risk,
          input: routed.approval?.input,
          callback: step.callback,
          key: step.key
        }
      });
      await this.store.put(next);
      return next;
    }
    const checkpoint = await this.store.put(state);
    const result = routed.execute ? await routed.execute() : routed;
    const next = transitionAutomation(checkpoint, {
      type: 'complete_step',
      key: step.key
    });
    await this.store.put(next);
    return { ...next, lastResult: result };
  }
  async resume(state, { approval, key }) {
    if (this.killSwitch && (await this.killSwitch.automationBlocked()))
      throw new Error('Automation blocked by emergency kill switch');
    if (!approval || state.approvalIntent?.key !== key)
      throw new Error('Matching approval required');
    const resumed = transitionAutomation(state, { type: 'resume', key });
    await this.store.put(resumed);
    return resumed;
  }
}
