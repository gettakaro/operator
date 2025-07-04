import * as k8s from '@kubernetes/client-node';
import { BaseController, ReconcileResult } from './base-controller.js';
import {
  Domain,
  DomainCondition,
  DomainStatus,
  DOMAIN_GROUP,
  DOMAIN_VERSION,
  DOMAIN_PLURAL,
} from '../apis/v1/domain.js';
import { TakaroClient, TakaroClientError, TakaroRootUser } from '../services/takaro-client.js';
import { StatusUpdater } from '../utils/status-updater.js';
import { loadConfig } from '../config/index.js';

const FINALIZER_NAME = 'takaro.io/domain-protection';

// Debug: Log constants at import time
console.log(
  `[MODULE LOAD] Domain constants: DOMAIN_GROUP=${DOMAIN_GROUP}, DOMAIN_VERSION=${DOMAIN_VERSION}, DOMAIN_PLURAL=${DOMAIN_PLURAL}`,
);
console.log(
  `[DEBUG] Domain constants at import: DOMAIN_GROUP=${DOMAIN_GROUP}, DOMAIN_VERSION=${DOMAIN_VERSION}, DOMAIN_PLURAL=${DOMAIN_PLURAL}`,
);

export class DomainController extends BaseController {
  private takaroClient: TakaroClient;

  constructor(kc: k8s.KubeConfig, namespace?: string) {
    super(kc, {
      group: DOMAIN_GROUP,
      version: DOMAIN_VERSION,
      plural: DOMAIN_PLURAL,
      namespace,
    });

    const config = loadConfig();
    this.takaroClient = new TakaroClient(config.takaroApiUrl, config.takaroApiToken);
  }

  protected async reconcile(namespace: string, name: string): Promise<ReconcileResult> {
    console.log(`Reconciling Domain ${namespace}/${name}`);

    const resource = await this.getResource(namespace, name);
    console.log(`[DEBUG] Raw resource retrieved:`, resource ? 'Found' : 'Not found');
    console.log(`[DEBUG] Resource type:`, typeof resource);
    console.log(`[DEBUG] Resource keys:`, resource ? Object.keys(resource) : 'N/A');
    console.log(`[DEBUG] Resource content:`, JSON.stringify(resource, null, 2));

    const domain = resource as Domain | null;
    if (!domain) {
      console.log(`Domain ${namespace}/${name} not found, skipping reconciliation`);
      return {};
    }

    try {
      if (domain.metadata?.deletionTimestamp) {
        return await this.handleDeletion(domain);
      }

      await this.ensureFinalizer(domain);

      const updatedStatus = await this.reconcileDomain(domain);
      await this.updateResourceStatus(namespace, name, updatedStatus);

      return {
        requeue: true,
        requeueAfter: 60000,
      };
    } catch (error) {
      console.error(`Error reconciling Domain ${namespace}/${name}:`, error);

      try {
        const domain = (await this.getResource(namespace, name)) as Domain | null;
        if (domain) {
          const conditions = domain.status?.conditions || [];
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          await this.updateResourceStatus(namespace, name, {
            ...domain.status,
            phase: 'Error',
            conditions: StatusUpdater.updateCondition(
              conditions,
              'Error',
              'True',
              'ReconcileError',
              errorMessage,
            ) as DomainCondition[],
            lastReconcileTime: new Date().toISOString(),
          });
        }
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }

      return {
        requeue: true,
        requeueAfter: 5000,
      };
    }
  }

  private async reconcileDomain(domain: Domain): Promise<DomainStatus> {
    const currentPhase = domain.status?.phase || 'Pending';
    let conditions = domain.status?.conditions || [];
    let newPhase = currentPhase;
    let externalReferenceId = domain.status?.externalReferenceId;
    let registrationToken = domain.status?.registrationToken;
    let rootUserCredentials = domain.status?.rootUserCredentials;

    const specLimits = domain.spec.limits;
    const specSettings = domain.spec.settings;

    if (!externalReferenceId) {
      // Generate our own external reference ID
      externalReferenceId = this.generateExternalReferenceId(domain);
      console.log(`Creating domain ${domain.spec.name} in Takaro with external reference: ${externalReferenceId}`);
      newPhase = 'Creating';

      try {
        const takaroDomain = await this.takaroClient.createDomain(
          domain.spec.name,
          externalReferenceId,
          specLimits,
          specSettings,
        );

        registrationToken = await this.takaroClient.generateRegistrationToken(takaroDomain.id);

        // Use root user from domain creation response
        if (!takaroDomain.rootUser) {
          throw new Error('Domain creation did not return root user credentials');
        }

        await this.createSecrets(domain, registrationToken, takaroDomain.rootUser);

        rootUserCredentials = {
          username: takaroDomain.rootUser.username,
          secretName: `${domain.metadata?.name}-root-credentials`,
        };

        newPhase = 'Ready';
        conditions = StatusUpdater.updateCondition(
          conditions,
          'Ready',
          'True',
          'DomainCreated',
          'Domain has been successfully created in Takaro',
        ) as DomainCondition[];
        conditions = StatusUpdater.updateCondition(
          conditions,
          'Synced',
          'True',
          'SpecSynced',
          'Domain configuration is synchronized with Takaro',
        ) as DomainCondition[];
        conditions = StatusUpdater.updateCondition(
          conditions,
          'Error',
          'False',
          'NoError',
          'No errors',
        ) as DomainCondition[];
      } catch (error) {
        console.error('Failed to create domain:', error);
        newPhase = 'Error';
        const errorMessage = error instanceof TakaroClientError ? error.message : 'Failed to create domain';

        conditions = StatusUpdater.updateCondition(
          conditions,
          'Ready',
          'False',
          'CreateFailed',
          errorMessage,
        ) as DomainCondition[];
        conditions = StatusUpdater.updateCondition(
          conditions,
          'Error',
          'True',
          'CreateError',
          errorMessage,
        ) as DomainCondition[];

        throw error;
      }
    } else {
      const hasSpecChanged = this.hasSpecChanged(domain);

      if (hasSpecChanged) {
        console.log(`Updating domain ${externalReferenceId} in Takaro`);

        try {
          await this.takaroClient.updateDomain(externalReferenceId, specLimits, specSettings);

          conditions = StatusUpdater.updateCondition(
            conditions,
            'Synced',
            'True',
            'SpecSynced',
            'Domain configuration has been updated in Takaro',
          ) as DomainCondition[];
        } catch (error) {
          console.error('Failed to update domain:', error);
          const errorMessage = error instanceof TakaroClientError ? error.message : 'Failed to update domain';

          conditions = StatusUpdater.updateCondition(
            conditions,
            'Synced',
            'False',
            'UpdateFailed',
            errorMessage,
          ) as DomainCondition[];
          conditions = StatusUpdater.updateCondition(
            conditions,
            'Error',
            'True',
            'UpdateError',
            errorMessage,
          ) as DomainCondition[];

          throw error;
        }
      }

      if (newPhase !== 'Ready' && newPhase !== 'Error') {
        newPhase = 'Ready';
        conditions = StatusUpdater.updateCondition(
          conditions,
          'Ready',
          'True',
          'DomainReady',
          'Domain is ready',
        ) as DomainCondition[];
      }
    }

    return {
      phase: newPhase,
      conditions,
      externalReferenceId,
      registrationToken,
      rootUserCredentials,
      lastReconcileTime: new Date().toISOString(),
      observedGeneration: domain.metadata?.generation,
    };
  }

  private async handleDeletion(domain: Domain): Promise<ReconcileResult> {
    console.log(`Handling deletion for Domain ${domain.metadata?.namespace}/${domain.metadata?.name}`);

    const hasFinalizer = domain.metadata?.finalizers?.includes(FINALIZER_NAME);
    if (!hasFinalizer) {
      return {};
    }

    if (domain.status?.externalReferenceId) {
      try {
        if (!domain.metadata?.namespace || !domain.metadata?.name) {
          throw new Error('Domain metadata is missing namespace or name');
        }
        await this.updateResourceStatus(domain.metadata.namespace, domain.metadata.name, {
          ...domain.status,
          phase: 'Deleting',
        });

        await this.takaroClient.deleteDomain(domain.status.externalReferenceId);
        console.log(`Successfully deleted domain ${domain.status.externalReferenceId} from Takaro`);
      } catch (error) {
        console.error('Failed to delete domain from Takaro:', error);
        if (error instanceof TakaroClientError && error.statusCode !== 404) {
          return {
            requeue: true,
            requeueAfter: 5000,
          };
        }
      }
    }

    await this.removeFinalizer(domain);
    return {};
  }

  private async ensureFinalizer(domain: Domain): Promise<void> {
    const hasFinalizer = domain.metadata?.finalizers?.includes(FINALIZER_NAME);
    if (!hasFinalizer) {
      console.log(`Adding finalizer to Domain ${domain.metadata?.namespace}/${domain.metadata?.name}`);
      console.log(
        `[DEBUG] Domain constants: DOMAIN_GROUP=${DOMAIN_GROUP}, DOMAIN_VERSION=${DOMAIN_VERSION}, DOMAIN_PLURAL=${DOMAIN_PLURAL}`,
      );

      // Import constants locally to debug
      const localGroup = 'takaro.io';
      const localVersion = 'v1';
      const localPlural = 'domains';

      console.log(`[DEBUG] Local constants: group=${localGroup}, version=${localVersion}, plural=${localPlural}`);
      console.log(`[DEBUG] this.options:`, JSON.stringify(this.options));

      // Use JSON Patch format
      const patch = [
        {
          op: 'add',
          path: '/metadata/finalizers',
          value: [...(domain.metadata?.finalizers || []), FINALIZER_NAME],
        },
      ];

      try {
        const patchParams = {
          group: localGroup,
          version: localVersion,
          namespace: domain.metadata?.namespace || '',
          plural: localPlural,
          name: domain.metadata?.name || '',
          body: patch,
        };

        console.log(`[DEBUG] Patch parameters:`, JSON.stringify(patchParams));

        // Call patchNamespacedCustomObject with proper typing
        const patchOptions = {
          headers: { 'Content-Type': k8s.PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH },
        };
        await this.customObjectsApi.patchNamespacedCustomObject(
          localGroup,
          localVersion,
          domain.metadata?.namespace || '',
          localPlural,
          domain.metadata?.name || '',
          patch,
          undefined,
          undefined,
          undefined,
          patchOptions
        );
      } catch (error: any) {
        console.error(`Failed to add finalizer:`, error);
        console.error(`Error details:`, error.response?.body || error.message || error);
        console.error(`Error statusCode:`, error.statusCode);
        console.error(
          `DOMAIN_GROUP: ${DOMAIN_GROUP}, DOMAIN_VERSION: ${DOMAIN_VERSION}, DOMAIN_PLURAL: ${DOMAIN_PLURAL}`,
        );
        throw error;
      }
    }
  }

  private async removeFinalizer(domain: Domain): Promise<void> {
    console.log(`Removing finalizer from Domain ${domain.metadata?.namespace}/${domain.metadata?.name}`);

    const finalizers = (domain.metadata?.finalizers || []).filter((f) => f !== FINALIZER_NAME);

    // Use JSON Patch format
    const patch = [
      {
        op: 'replace',
        path: '/metadata/finalizers',
        value: finalizers,
      },
    ];

    try {
      const patchOptions = {
        headers: { 'Content-Type': k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH },
      };
      await this.customObjectsApi.patchNamespacedCustomObject(
        DOMAIN_GROUP,
        DOMAIN_VERSION,
        domain.metadata?.namespace || '',
        DOMAIN_PLURAL,
        domain.metadata?.name || '',
        patch,
        undefined,
        undefined,
        undefined,
        patchOptions
      );
    } catch (error: any) {
      console.error(`Failed to remove finalizer:`, error.response?.body || error.message);
      throw error;
    }
  }

  private async createSecrets(
    domain: Domain,
    registrationToken: string,
    rootUser: { username: string; password: string },
  ): Promise<void> {
    if (!domain.metadata?.namespace || !domain.metadata?.name || !domain.metadata?.uid) {
      throw new Error('Domain metadata is missing required fields');
    }
    const namespace = domain.metadata.namespace;
    const domainName = domain.metadata.name;

    const tokenSecret: k8s.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${domainName}-registration-token`,
        namespace,
        ownerReferences: [
          {
            apiVersion: `${DOMAIN_GROUP}/${DOMAIN_VERSION}`,
            kind: 'Domain',
            name: domainName,
            uid: domain.metadata.uid,
            controller: true,
            blockOwnerDeletion: true,
          },
        ],
      },
      type: 'Opaque',
      data: {
        token: Buffer.from(registrationToken).toString('base64'),
      },
    };

    const credentialsSecret: k8s.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${domainName}-root-credentials`,
        namespace,
        ownerReferences: [
          {
            apiVersion: `${DOMAIN_GROUP}/${DOMAIN_VERSION}`,
            kind: 'Domain',
            name: domainName,
            uid: domain.metadata.uid,
            controller: true,
            blockOwnerDeletion: true,
          },
        ],
      },
      type: 'Opaque',
      data: {
        username: Buffer.from(rootUser.username).toString('base64'),
        password: Buffer.from(rootUser.password).toString('base64'),
      },
    };

    try {
      await this.coreApi.createNamespacedSecret({ namespace, body: tokenSecret });
      console.log(`Created registration token secret for domain ${domainName}`);
    } catch (error: any) {
      if (error.statusCode !== 409) {
        throw error;
      }
      console.log(`Registration token secret already exists for domain ${domainName}`);
    }

    try {
      await this.coreApi.createNamespacedSecret({ namespace, body: credentialsSecret });
      console.log(`Created root credentials secret for domain ${domainName}`);
    } catch (error: any) {
      if (error.statusCode !== 409) {
        throw error;
      }
      console.log(`Root credentials secret already exists for domain ${domainName}`);
    }
  }

  private hasSpecChanged(domain: Domain): boolean {
    if (!domain.status?.observedGeneration) {
      return true;
    }

    return domain.metadata?.generation !== domain.status.observedGeneration;
  }

  private generateExternalReferenceId(domain: Domain): string {
    if (!domain.metadata?.namespace || !domain.metadata?.name || !domain.metadata?.uid) {
      throw new Error('Domain metadata is missing required fields');
    }
    const namespace = domain.metadata.namespace;
    const name = domain.metadata.name;
    const uid = domain.metadata.uid;

    // Take first 8 characters of UID for uniqueness while keeping ID manageable
    const shortUid = uid.substring(0, 8);

    return `k8s-operator-${namespace}-${name}-${shortUid}`;
  }

  // Method to retrieve root credentials from K8s secret when needed
  // This can be used instead of storing passwords in memory
  async getRootCredentialsFromSecret(namespace: string, domainName: string): Promise<TakaroRootUser | null> {
    try {
      const secretName = `${domainName}-root-credentials`;
      const secret = await this.coreApi.readNamespacedSecret({
        name: secretName,
        namespace,
      });
      if (secret.data) {
        const username = Buffer.from(secret.data.username || '', 'base64').toString();
        const password = Buffer.from(secret.data.password || '', 'base64').toString();

        if (username && password) {
          return { username, password };
        }
      }
      return null;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}
