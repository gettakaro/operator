import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as k8s from '@kubernetes/client-node';
import { DomainController } from '../../src/controllers/domain-controller.js';
import { Domain, DomainStatus } from '../../src/apis/v1/domain.js';
import { TakaroClient } from '../../src/services/takaro-client.js';

const TEST_NAMESPACE = 'test-domain-lifecycle';
const TEST_DOMAIN_NAME = 'test-domain';

class MockTakaroClient extends TakaroClient {
  private domains = new Map<string, any>();
  private shouldFailCreate = false;
  private shouldFailUpdate = false;
  private shouldFailDelete = false;

  setFailCreate(fail: boolean) {
    this.shouldFailCreate = fail;
  }

  setFailUpdate(fail: boolean) {
    this.shouldFailUpdate = fail;
  }

  setFailDelete(fail: boolean) {
    this.shouldFailDelete = fail;
  }

  async createDomain(name: string, limits?: any, settings?: any) {
    if (this.shouldFailCreate) {
      throw new Error('Mock create domain failed');
    }

    const domainId = `dom-${Date.now()}`;
    const domain = {
      id: domainId,
      name,
      limits,
      settings,
    };
    this.domains.set(domainId, domain);
    return domain;
  }

  async updateDomain(domainId: string, limits?: any, settings?: any) {
    if (this.shouldFailUpdate) {
      throw new Error('Mock update domain failed');
    }

    const domain = this.domains.get(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    Object.assign(domain, { limits, settings });
    return domain;
  }

  async deleteDomain(domainId: string) {
    if (this.shouldFailDelete) {
      throw new Error('Mock delete domain failed');
    }

    if (!this.domains.has(domainId)) {
      const error: any = new Error('Domain not found');
      error.statusCode = 404;
      throw error;
    }

    this.domains.delete(domainId);
  }

  async getDomain(domainId: string) {
    return this.domains.get(domainId) || null;
  }

  async generateRegistrationToken(domainId: string) {
    return `token-${domainId}`;
  }

  async createRootUser(domainId: string) {
    return {
      username: `root-${domainId.substring(0, 8)}`,
      password: 'mock-password-123',
    };
  }
}

describe('Domain Lifecycle Integration Tests', () => {
  let kc: k8s.KubeConfig;
  let k8sApi: k8s.CustomObjectsApi;
  let coreApi: k8s.CoreV1Api;
  let controller: DomainController;
  let mockTakaroClient: MockTakaroClient;

  beforeEach(async () => {
    kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    
    k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
    coreApi = kc.makeApiClient(k8s.CoreV1Api);

    try {
      await coreApi.createNamespace({
        body: {
          metadata: { name: TEST_NAMESPACE },
        },
      });
    } catch (error: any) {
      if (error.statusCode !== 409) {
        throw error;
      }
    }

    controller = new DomainController(kc, TEST_NAMESPACE);
    mockTakaroClient = new MockTakaroClient();
    (controller as any).takaroClient = mockTakaroClient;
  });

  afterEach(async () => {
    try {
      await k8sApi.deleteNamespacedCustomObject({
        group: 'takaro.io',
        version: 'v1',
        namespace: TEST_NAMESPACE,
        plural: 'domains',
        name: TEST_DOMAIN_NAME,
      });
    } catch (error) {
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it('should create a domain successfully', async () => {
    const domain: Domain = {
      apiVersion: 'takaro.io/v1',
      kind: 'Domain',
      metadata: {
        name: TEST_DOMAIN_NAME,
        namespace: TEST_NAMESPACE,
      },
      spec: {
        name: 'My Test Domain',
        limits: {
          maxPlayers: 100,
          maxGameServers: 5,
        },
        settings: {
          maintenanceMode: false,
        },
      },
    };

    await k8sApi.createNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      body: domain,
    });

    const result = await (controller as any).reconcile(TEST_NAMESPACE, TEST_DOMAIN_NAME);
    
    assert.ok(result.requeue);
    assert.equal(result.requeueAfter, 60000);

    const updatedDomain = await k8sApi.getNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      name: TEST_DOMAIN_NAME,
    }) as { body: Domain };

    const status = updatedDomain.body.status as DomainStatus;
    assert.equal(status.phase, 'Ready');
    assert.ok(status.externalReferenceId?.startsWith('dom-'));
    assert.ok(status.registrationToken);
    assert.equal(status.rootUserCredentials?.username, `root-${status.externalReferenceId?.substring(0, 8)}`);
    
    const readyCondition = status.conditions?.find(c => c.type === 'Ready');
    assert.equal(readyCondition?.status, 'True');
    assert.equal(readyCondition?.reason, 'DomainCreated');
  });

  it('should handle domain creation failure', async () => {
    mockTakaroClient.setFailCreate(true);

    const domain: Domain = {
      apiVersion: 'takaro.io/v1',
      kind: 'Domain',
      metadata: {
        name: TEST_DOMAIN_NAME,
        namespace: TEST_NAMESPACE,
      },
      spec: {
        name: 'My Test Domain',
      },
    };

    await k8sApi.createNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      body: domain,
    });

    const result = await (controller as any).reconcile(TEST_NAMESPACE, TEST_DOMAIN_NAME);
    
    assert.ok(result.requeue);
    assert.equal(result.requeueAfter, 5000);

    const updatedDomain = await k8sApi.getNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      name: TEST_DOMAIN_NAME,
    }) as { body: Domain };

    const status = updatedDomain.body.status as DomainStatus;
    assert.equal(status.phase, 'Error');
    
    const errorCondition = status.conditions?.find(c => c.type === 'Error');
    assert.equal(errorCondition?.status, 'True');
    assert.equal(errorCondition?.reason, 'ReconcileError');
  });

  it('should update domain when spec changes', async () => {
    const domain: Domain = {
      apiVersion: 'takaro.io/v1',
      kind: 'Domain',
      metadata: {
        name: TEST_DOMAIN_NAME,
        namespace: TEST_NAMESPACE,
      },
      spec: {
        name: 'My Test Domain',
        limits: {
          maxPlayers: 100,
        },
      },
    };

    await k8sApi.createNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      body: domain,
    });

    await (controller as any).reconcile(TEST_NAMESPACE, TEST_DOMAIN_NAME);

    await k8sApi.patchNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      name: TEST_DOMAIN_NAME,
      body: {
        spec: {
          limits: {
            maxPlayers: 200,
          },
          settings: {
            maintenanceMode: true,
          },
        },
      },
      headers: {
        'Content-Type': k8s.PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH,
      },
    });

    const result = await (controller as any).reconcile(TEST_NAMESPACE, TEST_DOMAIN_NAME);
    
    assert.ok(result.requeue);

    const updatedDomain = await k8sApi.getNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      name: TEST_DOMAIN_NAME,
    }) as { body: Domain };

    const status = updatedDomain.body.status as DomainStatus;
    const syncedCondition = status.conditions?.find(c => c.type === 'Synced');
    assert.equal(syncedCondition?.status, 'True');
    assert.equal(syncedCondition?.message, 'Domain configuration has been updated in Takaro');
  });

  it('should handle domain deletion with finalizer', async () => {
    const domain: Domain = {
      apiVersion: 'takaro.io/v1',
      kind: 'Domain',
      metadata: {
        name: TEST_DOMAIN_NAME,
        namespace: TEST_NAMESPACE,
      },
      spec: {
        name: 'My Test Domain',
      },
    };

    await k8sApi.createNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      body: domain,
    });

    await (controller as any).reconcile(TEST_NAMESPACE, TEST_DOMAIN_NAME);

    const domainWithFinalizer = await k8sApi.getNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      name: TEST_DOMAIN_NAME,
    }) as { body: Domain };

    assert.ok(domainWithFinalizer.body.metadata?.finalizers?.includes('takaro.io/domain-protection'));

    await k8sApi.deleteNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      name: TEST_DOMAIN_NAME,
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const deletingDomain = await k8sApi.getNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      name: TEST_DOMAIN_NAME,
    }) as { body: Domain };

    assert.ok(deletingDomain.body.metadata?.deletionTimestamp);

    const result = await (controller as any).reconcile(TEST_NAMESPACE, TEST_DOMAIN_NAME);
    
    assert.deepEqual(result, {});

    try {
      await k8sApi.getNamespacedCustomObject({
        group: 'takaro.io',
        version: 'v1',
        namespace: TEST_NAMESPACE,
        plural: 'domains',
        name: TEST_DOMAIN_NAME,
      });
      assert.fail('Domain should have been deleted');
    } catch (error: any) {
      assert.equal(error.statusCode, 404);
    }
  });

  it('should check secret creation', async () => {
    const domain: Domain = {
      apiVersion: 'takaro.io/v1',
      kind: 'Domain',
      metadata: {
        name: TEST_DOMAIN_NAME,
        namespace: TEST_NAMESPACE,
      },
      spec: {
        name: 'My Test Domain',
      },
    };

    await k8sApi.createNamespacedCustomObject({
      group: 'takaro.io',
      version: 'v1',
      namespace: TEST_NAMESPACE,
      plural: 'domains',
      body: domain,
    });

    await (controller as any).reconcile(TEST_NAMESPACE, TEST_DOMAIN_NAME);

    const tokenSecret = await coreApi.readNamespacedSecret({
      namespace: TEST_NAMESPACE,
      name: `${TEST_DOMAIN_NAME}-registration-token`,
    });

    assert.ok(tokenSecret.body.data?.token);

    const credentialsSecret = await coreApi.readNamespacedSecret({
      namespace: TEST_NAMESPACE,
      name: `${TEST_DOMAIN_NAME}-root-credentials`,
    });

    assert.ok(credentialsSecret.body.data?.username);
    assert.ok(credentialsSecret.body.data?.password);

    const ownerRef = tokenSecret.body.metadata?.ownerReferences?.[0];
    assert.equal(ownerRef?.kind, 'Domain');
    assert.equal(ownerRef?.name, TEST_DOMAIN_NAME);
    assert.equal(ownerRef?.controller, true);
  });
});