import { GuidedNexaDevBot } from './guide-bot.js';
import { DurableKillSwitchStoreClient } from './core/kill-switch-store.js';
import { KillSwitch } from './core/kill-switch.js';

export class KillSwitchGuidedNexaDevBot extends GuidedNexaDevBot {
  constructor(env = {}) {
    super(env);
    this.killSwitch = new KillSwitch({ store: new DurableKillSwitchStoreClient({ namespace: env.KILL_SWITCH_STORE }) });
    this.router.killSwitch = this.killSwitch;
  }
}
