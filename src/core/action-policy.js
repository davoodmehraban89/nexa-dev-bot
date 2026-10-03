const KNOWN_RISKS = new Set(['READ', 'WRITE', 'DESTRUCTIVE']);

export class ActionPolicy {
  evaluate({ action, isOwner, approved = false } = {}) {
    const risk = action?.risk || null;

    if (!isOwner) {
      return {
        allowed: false,
        requiresApproval: false,
        risk,
        reason: 'owner_required'
      };
    }

    if (!action || !KNOWN_RISKS.has(risk)) {
      return {
        allowed: false,
        requiresApproval: false,
        risk,
        reason: 'unknown_action'
      };
    }

    if (risk === 'READ') {
      return {
        allowed: true,
        requiresApproval: false,
        risk,
        reason: 'owner_read_allowed'
      };
    }

    if (approved === true) {
      return {
        allowed: true,
        requiresApproval: false,
        risk,
        reason: risk === 'WRITE' ? 'owner_write_approved' : 'owner_destructive_approved'
      };
    }

    if (risk === 'WRITE') {
      return {
        allowed: false,
        requiresApproval: true,
        risk,
        reason: 'owner_write_requires_approval'
      };
    }

    return {
      allowed: false,
      requiresApproval: true,
      risk,
      reason: 'owner_destructive_requires_approval'
    };
  }
}
