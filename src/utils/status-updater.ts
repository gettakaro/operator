export interface Condition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  lastTransitionTime: string;
  reason: string;
  message: string;
}

export class StatusUpdater {
  static updateCondition(
    conditions: Condition[],
    type: string,
    status: 'True' | 'False' | 'Unknown',
    reason: string,
    message: string
  ): Condition[] {
    const now = new Date().toISOString();
    const existingIndex = conditions.findIndex(c => c.type === type);

    const newCondition: Condition = {
      type,
      status,
      reason,
      message,
      lastTransitionTime: now,
    };

    if (existingIndex === -1) {
      return [...conditions, newCondition];
    }

    const existing = conditions[existingIndex];
    const hasChanged = existing.status !== status || existing.reason !== reason;

    if (!hasChanged) {
      newCondition.lastTransitionTime = existing.lastTransitionTime;
    }

    return [
      ...conditions.slice(0, existingIndex),
      newCondition,
      ...conditions.slice(existingIndex + 1),
    ];
  }

  static mergeConditions(existing: Condition[], updates: Condition[]): Condition[] {
    const result = [...existing];

    for (const update of updates) {
      const index = result.findIndex(c => c.type === update.type);
      if (index === -1) {
        result.push(update);
      } else {
        result[index] = update;
      }
    }

    return result;
  }

  static createReadyCondition(ready: boolean, reason: string, message: string): Condition {
    return {
      type: 'Ready',
      status: ready ? 'True' : 'False',
      reason,
      message,
      lastTransitionTime: new Date().toISOString(),
    };
  }

  static createSyncedCondition(synced: boolean, reason: string, message: string): Condition {
    return {
      type: 'Synced',
      status: synced ? 'True' : 'False',
      reason,
      message,
      lastTransitionTime: new Date().toISOString(),
    };
  }

  static createErrorCondition(hasError: boolean, reason: string, message: string): Condition {
    return {
      type: 'Error',
      status: hasError ? 'True' : 'False',
      reason,
      message,
      lastTransitionTime: new Date().toISOString(),
    };
  }

  static isConditionTrue(conditions: Condition[], type: string): boolean {
    const condition = conditions.find(c => c.type === type);
    return condition?.status === 'True';
  }

  static getCondition(conditions: Condition[], type: string): Condition | undefined {
    return conditions.find(c => c.type === type);
  }

  static getConditionAge(condition: Condition): number {
    const conditionTime = new Date(condition.lastTransitionTime);
    const now = new Date();
    return (now.getTime() - conditionTime.getTime()) / 1000;
  }
}