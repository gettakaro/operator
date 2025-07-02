import * as k8s from '@kubernetes/client-node';
import { EventEmitter } from 'events';

export interface ReconcileRequest {
  namespace: string;
  name: string;
  resourceVersion?: string;
}

export interface ReconcileResult {
  requeue?: boolean;
  requeueAfter?: number;
  error?: Error;
}

export interface ControllerOptions {
  group: string;
  version: string;
  plural: string;
  reconcileInterval?: number;
  namespace?: string;
}

export abstract class BaseController extends EventEmitter {
  protected kc: k8s.KubeConfig;
  protected customObjectsApi: k8s.CustomObjectsApi;
  protected options: Required<ControllerOptions>;
  protected reconcileQueue: Map<string, ReconcileRequest> = new Map();
  protected watchAbortController?: AbortController;
  protected reconcileIntervalId?: NodeJS.Timeout;
  protected isRunning = false;

  constructor(kc: k8s.KubeConfig, options: ControllerOptions) {
    super();
    this.kc = kc;
    this.customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
    this.options = {
      reconcileInterval: 30000,
      namespace: '',
      ...options,
    };
  }

  abstract reconcile(request: ReconcileRequest): Promise<ReconcileResult>;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Controller for ${this.options.plural} is already running`);
      return;
    }

    console.log(`Starting controller for ${this.options.plural}...`);
    this.isRunning = true;

    await this.setupWatch();
    this.startReconcileLoop();

    console.log(`Controller for ${this.options.plural} started successfully`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log(`Controller for ${this.options.plural} is not running`);
      return;
    }

    console.log(`Stopping controller for ${this.options.plural}...`);
    this.isRunning = false;

    if (this.watchAbortController) {
      this.watchAbortController.abort();
    }

    if (this.reconcileIntervalId) {
      clearInterval(this.reconcileIntervalId);
    }

    this.reconcileQueue.clear();
    console.log(`Controller for ${this.options.plural} stopped successfully`);
  }

  protected async setupWatch(): Promise<void> {
    this.watchAbortController = new AbortController();
    const informer = k8s.makeInformer(
      this.kc,
      this.getWatchPath(),
      async () => {
        const result = await this.listResources();
        return result.body;
      },
    );

    informer.on('add', (obj: any) => {
      this.enqueueReconcile(obj);
    });

    informer.on('update', (obj: any) => {
      this.enqueueReconcile(obj);
    });

    informer.on('delete', (obj: any) => {
      this.enqueueReconcile(obj, true);
    });

    informer.on('error', (err: any) => {
      console.error(`Watch error for ${this.options.plural}:`, err);
      if (err.statusCode === 410) {
        console.log('Restarting watch due to expired resourceVersion...');
        setTimeout(() => this.setupWatch(), 1000);
      }
    });

    await informer.start();
  }

  protected getWatchPath(): string {
    const { group, version, plural, namespace } = this.options;
    if (namespace) {
      return `/apis/${group}/${version}/namespaces/${namespace}/${plural}`;
    }
    return `/apis/${group}/${version}/${plural}`;
  }

  protected async listResources(): Promise<{ response: any; body: any }> {
    const { group, version, plural, namespace } = this.options;
    if (namespace) {
      return this.customObjectsApi.listNamespacedCustomObject({
        group,
        version,
        namespace,
        plural,
      });
    }
    return this.customObjectsApi.listClusterCustomObject({
      group,
      version,
      plural,
    });
  }

  protected enqueueReconcile(obj: any, isDelete = false): void {
    const key = `${obj.metadata.namespace}/${obj.metadata.name}`;
    const request: ReconcileRequest = {
      namespace: obj.metadata.namespace || '',
      name: obj.metadata.name,
      resourceVersion: obj.metadata.resourceVersion,
    };

    if (isDelete) {
      console.log(`Resource ${key} deleted, removing from queue`);
      this.reconcileQueue.delete(key);
    } else {
      console.log(`Enqueuing reconcile for ${key}`);
      this.reconcileQueue.set(key, request);
    }
  }

  protected startReconcileLoop(): void {
    this.reconcileIntervalId = setInterval(async () => {
      if (!this.isRunning) return;

      const requests = Array.from(this.reconcileQueue.values());
      if (requests.length === 0) return;

      console.log(`Processing ${requests.length} reconcile requests for ${this.options.plural}`);

      for (const request of requests) {
        const key = `${request.namespace}/${request.name}`;
        try {
          const result = await this.reconcile(request);
          
          if (result.error) {
            console.error(`Reconcile error for ${key}:`, result.error);
            if (!result.requeue) {
              this.reconcileQueue.delete(key);
            }
          } else if (result.requeue) {
            console.log(`Requeuing ${key} after ${result.requeueAfter || 0}ms`);
            if (result.requeueAfter) {
              setTimeout(() => {
                this.reconcileQueue.set(key, request);
              }, result.requeueAfter);
              this.reconcileQueue.delete(key);
            }
          } else {
            this.reconcileQueue.delete(key);
          }
        } catch (error) {
          console.error(`Unexpected error reconciling ${key}:`, error);
          this.reconcileQueue.delete(key);
        }
      }
    }, this.options.reconcileInterval);
  }

  protected async getResource(namespace: string, name: string): Promise<any> {
    const { group, version, plural } = this.options;
    try {
      const response = await this.customObjectsApi.getNamespacedCustomObject({
        group,
        version,
        namespace,
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
        body: { status },
      });
    } catch (error) {
      console.error(`Failed to update status for ${namespace}/${name}:`, error);
      throw error;
    }
  }
}