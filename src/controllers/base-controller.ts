import * as k8s from '@kubernetes/client-node';

export interface ReconcileRequest {
  namespace: string;
  name: string;
  resourceVersion?: string;
}

export interface ReconcileResult {
  requeue?: boolean;
  requeueAfter?: number;
}

export interface ControllerOptions {
  group: string;
  version: string;
  plural: string;
  namespace?: string;
  reconcileInterval?: number;
}

export abstract class BaseController {
  protected readonly kc: k8s.KubeConfig;
  protected readonly coreApi: k8s.CoreV1Api;
  protected readonly customObjectsApi: k8s.CustomObjectsApi;
  protected readonly options: ControllerOptions;
  protected informer?: k8s.Informer<any>;
  protected readonly reconcileQueue: Map<string, ReconcileRequest> = new Map();
  protected isRunning = false;
  protected reconcileIntervalId?: NodeJS.Timeout;

  constructor(kc: k8s.KubeConfig, options: ControllerOptions) {
    this.kc = kc;
    this.options = options;
    this.coreApi = kc.makeApiClient(k8s.CoreV1Api);
    this.customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Controller for ${this.options.plural} is already running`);
      return;
    }

    console.log(`Starting controller for ${this.options.plural}...`);
    this.isRunning = true;

    await this.setupWatch();
    this.startReconcileLoop();
  }

  public async stop(): Promise<void> {
    console.log(`Stopping controller for ${this.options.plural}...`);
    this.isRunning = false;

    if (this.informer) {
      await this.informer.stop();
      this.informer = undefined;
    }

    if (this.reconcileIntervalId) {
      clearInterval(this.reconcileIntervalId);
      this.reconcileIntervalId = undefined;
    }

    this.reconcileQueue.clear();
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  protected abstract reconcile(namespace: string, name: string): Promise<ReconcileResult>;

  protected async setupWatch(): Promise<void> {
    const listFn = () => {
      const { group, version, plural, namespace } = this.options;
      if (namespace) {
        return this.customObjectsApi.listNamespacedCustomObject({
          group,
          version,
          namespace,
          plural,
        });
      } else {
        return this.customObjectsApi.listClusterCustomObject({
          group,
          version,
          plural,
        });
      }
    };

    this.informer = k8s.makeInformer(
      this.kc,
      `/apis/${this.options.group}/${this.options.version}/${this.options.namespace ? `namespaces/${this.options.namespace}/` : ''}${this.options.plural}`,
      listFn
    );

    this.informer.on('add', (obj: any) => {
      console.log(`Added ${this.options.plural}: ${obj.metadata.namespace}/${obj.metadata.name}`);
      this.enqueueReconcile(obj);
    });

    this.informer.on('update', (obj: any) => {
      console.log(`Updated ${this.options.plural}: ${obj.metadata.namespace}/${obj.metadata.name}`);
      this.enqueueReconcile(obj);
    });

    this.informer.on('delete', (obj: any) => {
      console.log(`Deleted ${this.options.plural}: ${obj.metadata.namespace}/${obj.metadata.name}`);
      this.enqueueReconcile(obj, true);
    });

    this.informer.on('error', (err: any) => {
      console.error(`Watch error for ${this.options.plural}:`, err);
      if (err.statusCode === 410) {
        console.log('Restarting watch due to expired resourceVersion...');
        setTimeout(() => {
          if (this.isRunning) {
            this.setupWatch();
          }
        }, 1000);
      }
    });

    await this.informer.start();
  }

  protected startReconcileLoop(): void {
    const interval = this.options.reconcileInterval || 30000;
    this.reconcileIntervalId = setInterval(() => {
      this.processReconcileQueue();
    }, 1000);
  }

  protected async processReconcileQueue(): Promise<void> {
    const requests = Array.from(this.reconcileQueue.values());
    
    for (const request of requests) {
      const key = `${request.namespace}/${request.name}`;
      this.reconcileQueue.delete(key);

      try {
        console.log(`Reconciling ${this.options.plural}: ${key}`);
        const result = await this.reconcile(request.namespace, request.name);

        if (result.requeue || result.requeueAfter) {
          const requeueAfter = result.requeueAfter || 5000;
          console.log(`Requeueing ${key} after ${requeueAfter}ms`);
          setTimeout(() => {
            this.enqueueReconcile({ metadata: { namespace: request.namespace, name: request.name } });
          }, requeueAfter);
        }
      } catch (error) {
        console.error(`Error reconciling ${key}:`, error);
        setTimeout(() => {
          this.enqueueReconcile({ metadata: { namespace: request.namespace, name: request.name } });
        }, 5000);
      }
    }
  }

  protected enqueueReconcile(obj: any, isDelete = false): void {
    const key = obj.metadata.namespace 
      ? `${obj.metadata.namespace}/${obj.metadata.name}`
      : obj.metadata.name;
    const request: ReconcileRequest = {
      namespace: obj.metadata.namespace || '',
      name: obj.metadata.name,
      resourceVersion: obj.metadata.resourceVersion,
    };

    if (isDelete) {
      console.log(`Enqueuing delete reconcile for ${key}`);
    }

    this.reconcileQueue.set(key, request);
  }

  protected requeue(namespace: string, name: string, after?: number): void {
    const key = namespace ? `${namespace}/${name}` : name;
    const request: ReconcileRequest = {
      namespace,
      name,
    };

    if (after) {
      console.log(`Requeueing ${key} after ${after}ms`);
      setTimeout(() => {
        this.reconcileQueue.set(key, request);
      }, after);
    } else {
      this.reconcileQueue.set(key, request);
    }
  }

  protected async getResource(namespace: string, name: string): Promise<any> {
    const { group, version, plural } = this.options;
    try {
      const response = namespace
        ? await this.customObjectsApi.getNamespacedCustomObject({
            group,
            version,
            namespace,
            plural,
            name,
          })
        : await this.customObjectsApi.getClusterCustomObject({
            group,
            version,
            plural,
            name,
          });
      return response.body;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  protected async updateResourceStatus(namespace: string, name: string, status: any): Promise<void> {
    const { group, version, plural } = this.options;
    try {
      await this.customObjectsApi.patchNamespacedCustomObjectStatus({
        group,
        version,
        namespace,
        plural,
        name,
        body: {
          status,
        },
        headers: {
          'Content-Type': k8s.PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH,
        },
      });
    } catch (error) {
      console.error(`Failed to update status for ${namespace}/${name}:`, error);
      throw error;
    }
  }
}