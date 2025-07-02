import * as k8s from '@kubernetes/client-node';
import { BaseController, ReconcileRequest, ReconcileResult } from './base-controller.js';
import { Domain, DomainCondition, DOMAIN_GROUP, DOMAIN_VERSION, DOMAIN_PLURAL } from '../apis/v1/domain.js';

export class DomainController extends BaseController {
  constructor(kc: k8s.KubeConfig, namespace?: string) {
    super(kc, {
      group: DOMAIN_GROUP,
      version: DOMAIN_VERSION,
      plural: DOMAIN_PLURAL,
      namespace,
    });
  }

  async reconcile(request: ReconcileRequest): Promise<ReconcileResult> {
    const { namespace, name } = request;
    console.log(`Reconciling Domain ${namespace}/${name}`);

    try {
      const domain = await this.getResource(namespace, name) as Domain | null;
      
      if (!domain) {
        console.log(`Domain ${namespace}/${name} not found, may have been deleted`);
        return {};
      }

      console.log(`Domain ${namespace}/${name} state:`, {
        phase: domain.status?.phase || 'Unknown',
        conditions: domain.status?.conditions?.length || 0,
        spec: {
          name: domain.spec.name,
          limits: domain.spec.limits,
          settings: domain.spec.settings,
        },
      });

      const currentPhase = domain.status?.phase || 'Pending';
      let newPhase = currentPhase;
      let conditions: DomainCondition[] = domain.status?.conditions || [];

      if (currentPhase === 'Pending') {
        console.log(`Domain ${namespace}/${name} is pending, simulating creation...`);
        newPhase = 'Creating';
        conditions = this.updateCondition(conditions, {
          type: 'Ready',
          status: 'False',
          reason: 'Creating',
          message: 'Domain is being created in Takaro',
        });
      } else if (currentPhase === 'Creating') {
        console.log(`Domain ${namespace}/${name} is creating, simulating completion...`);
        newPhase = 'Ready';
        conditions = this.updateCondition(conditions, {
          type: 'Ready',
          status: 'True',
          reason: 'Created',
          message: 'Domain successfully created in Takaro',
        });
        conditions = this.updateCondition(conditions, {
          type: 'Synced',
          status: 'True',
          reason: 'Synced',
          message: 'Domain configuration is in sync',
        });
      }

      if (newPhase !== currentPhase || this.conditionsChanged(domain.status?.conditions, conditions)) {
        await this.updateResourceStatus(namespace, name, {
          phase: newPhase,
          conditions,
          lastReconcileTime: new Date().toISOString(),
          observedGeneration: domain.metadata.generation,
        });
        console.log(`Updated Domain ${namespace}/${name} status: phase=${newPhase}`);
      }

      if (newPhase === 'Creating') {
        return { requeue: true, requeueAfter: 5000 };
      }

      return {};
    } catch (error) {
      console.error(`Error reconciling Domain ${namespace}/${name}:`, error);
      
      try {
        await this.updateResourceStatus(namespace, name, {
          conditions: this.updateCondition([], {
            type: 'Error',
            status: 'True',
            reason: 'ReconcileError',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          }),
          lastReconcileTime: new Date().toISOString(),
        });
      } catch (statusError) {
        console.error(`Failed to update error status for Domain ${namespace}/${name}:`, statusError);
      }

      return { error: error as Error, requeue: true, requeueAfter: 30000 };
    }
  }

  private updateCondition(
    conditions: DomainCondition[],
    update: Omit<DomainCondition, 'lastTransitionTime'>,
  ): DomainCondition[] {
    const now = new Date().toISOString();
    const existingIndex = conditions.findIndex((c) => c.type === update.type);
    
    const newCondition: DomainCondition = {
      ...update,
      lastTransitionTime: now,
    };

    if (existingIndex >= 0) {
      const existing = conditions[existingIndex];
      if (existing.status !== update.status) {
        conditions[existingIndex] = newCondition;
      } else {
        conditions[existingIndex] = {
          ...existing,
          reason: update.reason,
          message: update.message,
        };
      }
    } else {
      conditions.push(newCondition);
    }

    return conditions;
  }

  private conditionsChanged(
    oldConditions: DomainCondition[] | undefined,
    newConditions: DomainCondition[],
  ): boolean {
    if (!oldConditions) return true;
    if (oldConditions.length !== newConditions.length) return true;

    for (const newCond of newConditions) {
      const oldCond = oldConditions.find((c) => c.type === newCond.type);
      if (!oldCond) return true;
      if (
        oldCond.status !== newCond.status ||
        oldCond.reason !== newCond.reason ||
        oldCond.message !== newCond.message
      ) {
        return true;
      }
    }

    return false;
  }
}