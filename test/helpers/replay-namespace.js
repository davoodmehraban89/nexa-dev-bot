import { ApprovalReplayGuard } from '../../src/durable/approval-replay-guard.js';

export function makeReplayState({ failAlarm = false } = {}) {
  const data = new Map();
  let alarm = null;
  let transactionTail = Promise.resolve();
  const api = {
    async get(key) {
      return structuredClone(data.get(key));
    },
    async put(key, value) {
      data.set(key, structuredClone(value));
    },
    async delete(key) {
      return data.delete(key);
    },
    async setAlarm(value) {
      alarm = value;
    },
    async deleteAlarm() {
      alarm = null;
    },
    async deleteAll() {
      data.clear();
      alarm = null;
    }
  };
  return {
    data,
    get alarm() {
      return alarm;
    },
    storage: {
      ...api,
      transaction(fn) {
        const run = transactionTail.then(async () => {
          const pending = structuredClone(data);
          let nextAlarm = alarm;
          const result = await fn({
            async get(key) {
              return structuredClone(pending.get(key));
            },
            async put(key, value) {
              pending.set(key, structuredClone(value));
            },
            async delete(key) {
              return pending.delete(key);
            },
            async setAlarm(value) {
              if (failAlarm) throw new Error('alarm unavailable');
              nextAlarm = value;
            },
            async deleteAlarm() {
              nextAlarm = null;
            }
          });
          data.clear();
          for (const [key, value] of pending) data.set(key, value);
          alarm = nextAlarm;
          return result;
        });
        transactionTail = run.catch(() => {});
        return run;
      }
    }
  };
}

export function makeReplayNamespace(options) {
  const states = new Map();
  return {
    states,
    idFromName(name) {
      return String(name);
    },
    get(id) {
      if (!states.has(id)) states.set(id, makeReplayState(options));
      // Construct again for every request to exercise durable state after eviction.
      return {
        fetch: (request) =>
          new ApprovalReplayGuard(states.get(id)).fetch(request)
      };
    }
  };
}

let nextUpdateId = 1;
export function withUpdateId(update) {
  return { update_id: nextUpdateId++, ...update };
}
