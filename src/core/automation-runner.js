import { transitionAutomation } from './automation.js';
export class AutomationRunner {
  constructor({ router, store, killSwitch = null }) {
    this.router = router;
    this.store = store;
    this.killSwitch = killSwitch;
  }
  async advance(state) {
    if (
      typeof this.store?.claimStep !== 'function' ||
      typeof this.store?.completeStep !== 'function'
    )
      throw new Error('Persistent automation step claims are required');
    const blocked =
      this.killSwitch && (await this.killSwitch.automationBlocked());
    // Dispatch itself may perform provider effects. Reserve durably before it.
    const claim = await this.store.claimStep(state);
    if (!claim.claimed) return claim.state;
    const checkpoint = claim.state;
    const step = checkpoint.steps[checkpoint.cursor];
    const finish = (outcome, intent) =>
      this.store.completeStep(checkpoint.id, {
        token: claim.token,
        outcome,
        intent
      });
    if (blocked) return (await finish('pause_kill_switch')).state;
    const routed = await this.router.dispatchCallback(step.callback, {
      isOwner: true,
      ownerId: checkpoint.ownerId
    });
    if (!routed) throw new Error('Automation action unavailable');
    if (routed.killSwitchLocked)
      return (await finish('pause_kill_switch')).state;
    if (routed.requiresApproval) {
      return (
        await finish('pause_approval', {
          pluginId: routed.pluginId,
          actionId: routed.actionId,
          risk: routed.risk,
          input: routed.approval?.input,
          callback: step.callback,
          key: step.key
        })
      ).state;
    }
    if (routed.denied) return (await finish('fail')).state;
    const result = routed.execute ? await routed.execute() : routed;
    const completed = await finish('complete');
    return completed.completed
      ? { ...completed.state, lastResult: result }
      : completed.state;
  }
  async resume(state, { approval, key }) {
    if (this.killSwitch && (await this.killSwitch.automationBlocked()))
      throw new Error('Automation blocked by emergency kill switch');
    if (!approval || state.approvalIntent?.key !== key)
      throw new Error('Matching approval required');
    const resumed = transitionAutomation(state, { type: 'resume', key });
    return this.store.put(resumed);
  }
}
