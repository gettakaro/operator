import * as k8s from '@kubernetes/client-node';
import { BaseController, ReconcileResult } from './base-controller.js';
import { Domain, DomainCondition, DOMAIN_GROUP, DOMAIN_VERSION, DOMAIN_PLURAL } from '../apis/v1/domain.js';

export class DomainController extends BaseController {
  constructor(kc: k8s.KubeConfig, namespace?: string) {
    super(kc, {
      group: DOMAIN_GROUP,
      version: DOMAIN_VERSION,
      plural: DOMAIN_PLURAL,
      namespace,
      reconcileInterval: 30000,
    });
  }

  protected async reconcile(namespace: string, name: string): Promise<ReconcileResult> {
    console.log(`Reconciling Domain ${namespace}/${name}`);

    const domain = await this.getResource(namespace, name) as Domain | null;
    if (!domain) {
      console.log(`Domain ${namespace}/${name} not found, skipping reconciliation`);
      return {};
    }

    try {
      console.log(`Domain ${namespace}/${name} state:`, {
        phase: domain.status?.phase || 'Unknown',
        conditions: domain.status?.conditions?.length || 0,
        spec: {
          name: domain.spec.name,
          limits: domain.spec.limits,
          settings: domain.spec.settings,
        },
      });

      const updatedStatus = await this.reconcileDomain(domain);
      
      await this.updateResourceStatus(namespace, name, updatedStatus);

      return {
        requeue: true,
        requeueAfter: 60000,
      };
    } catch (error) {
      console.error(`Error reconciling Domain ${namespace}/${name}:`, error);
      
      try {
        const domain = await this.getResource(namespace, name) as Domain | null;
        const existingConditions = domain?.status?.conditions || [];
        await this.updateResourceStatus(namespace, name, {
          conditions: this.updateCondition(existingConditions, {
            type: 'Error',
            status: 'True',
            reason: 'ReconcileError',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          }),
          lastReconcileTime: new Date().toISOString(),
        });
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }
      
      return {
        requeue: true,
        requeueAfter: 5000,
      };
    }
  }

  private async reconcileDomain(domain: Domain): Promise<any> {
    const currentPhase = domain.status?.phase || 'Pending';
    const conditions = domain.status?.conditions || [];

    let newPhase = currentPhase;
    let newConditions = [...conditions];

    if (currentPhase === 'Pending') {
      newPhase = 'Provisioning';
      newConditions = this.updateCondition(newConditions, {
        type: 'Ready',
        status: 'False',
        reason: 'Provisioning',
        message: 'Domain is being provisioned',
      });
    } else if (currentPhase === 'Provisioning') {
      const readyCondition = conditions.find(c => c.type === 'Ready');
      if (readyCondition && this.isConditionOld(readyCondition, 30)) {
        newPhase = 'Active';
        newConditions = this.updateCondition(newConditions, {
          type: 'Ready',
          status: 'True',
          reason: 'Provisioned',
          message: 'Domain has been successfully provisioned',
        });
      }
    } else if (currentPhase === 'Active') {
      const maintenanceMode = domain.spec.settings?.maintenanceMode;
      if (maintenanceMode) {
        newPhase = 'Maintenance';
        newConditions = this.updateCondition(newConditions, {
          type: 'Ready',
          status: 'False',
          reason: 'MaintenanceMode',
          message: 'Domain is in maintenance mode',
        });
      }
    } else if (currentPhase === 'Maintenance') {
      const maintenanceMode = domain.spec.settings?.maintenanceMode;
      if (!maintenanceMode) {
        newPhase = 'Active';
        newConditions = this.updateCondition(newConditions, {
          type: 'Ready',
          status: 'True',
          reason: 'MaintenanceComplete',
          message: 'Domain maintenance completed',
        });
      }
    }

    if (!conditions.some(c => c.type === 'Synced')) {
      newConditions = this.updateCondition(newConditions, {
        type: 'Synced',
        status: 'True',
        reason: 'Synchronized',
        message: 'Domain configuration is synchronized',
      });
    }


    return {
      phase: newPhase,
      conditions: newConditions,
      lastReconcileTime: new Date().toISOString(),
      observedGeneration: domain.metadata?.generation,
    };
  }

  private updateCondition(conditions: DomainCondition[], newCondition: Omit<DomainCondition, 'lastTransitionTime'>): DomainCondition[] {
    const now = new Date().toISOString();
    const existingIndex = conditions.findIndex(c => c.type === newCondition.type);

    if (existingIndex === -1) {
      return [...conditions, {
        ...newCondition,
        lastTransitionTime: now,
      }];
    }

    const existing = conditions[existingIndex];
    const hasChanged = existing.status !== newCondition.status;

    const updated: DomainCondition = {
      ...newCondition,
      lastTransitionTime: hasChanged ? now : existing.lastTransitionTime,
    };

    return [
      ...conditions.slice(0, existingIndex),
      updated,
      ...conditions.slice(existingIndex + 1),
    ];
  }

  private isConditionOld(condition: DomainCondition, seconds: number): boolean {
    const conditionTime = new Date(condition.lastTransitionTime);
    const now = new Date();
    const ageInSeconds = (now.getTime() - conditionTime.getTime()) / 1000;
    return ageInSeconds > seconds;
  }
}