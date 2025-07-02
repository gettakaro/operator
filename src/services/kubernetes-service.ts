import * as k8s from '@kubernetes/client-node';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

export class KubernetesService {
  private kubeConfig: k8s.KubeConfig;
  private coreV1Api: k8s.CoreV1Api;
  private appsV1Api: k8s.AppsV1Api;
  private customObjectsApi: k8s.CustomObjectsApi;
  private watchNamespaces: string[];

  constructor() {
    this.kubeConfig = new k8s.KubeConfig();
    
    // Load kubeconfig - will use in-cluster config if available, otherwise default config
    try {
      // Check if we're running in a cluster by checking for service account token
      if (process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT) {
        this.kubeConfig.loadFromCluster();
        logger.info('Loaded in-cluster Kubernetes configuration');
      } else {
        // Load from default location or KUBECONFIG env var
        this.kubeConfig.loadFromDefault();
        logger.info('Loaded default Kubernetes configuration');
      }
    } catch (error) {
      logger.error('Failed to load Kubernetes configuration', error as Error);
      throw new Error('Unable to load Kubernetes configuration');
    }

    // Initialize API clients
    this.coreV1Api = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.appsV1Api = this.kubeConfig.makeApiClient(k8s.AppsV1Api);
    this.customObjectsApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);

    // Set watch namespaces
    this.watchNamespaces = config.kubernetes.watchNamespaces.length > 0 
      ? config.kubernetes.watchNamespaces 
      : ['default'];
    
    logger.info('Kubernetes service initialized', { 
      watchNamespaces: this.watchNamespaces 
    });
  }

  /**
   * Get the Kubernetes configuration
   */
  getKubeConfig(): k8s.KubeConfig {
    return this.kubeConfig;
  }

  /**
   * Get the Core V1 API client
   */
  getCoreV1Api(): k8s.CoreV1Api {
    return this.coreV1Api;
  }

  /**
   * Get the Apps V1 API client
   */
  getAppsV1Api(): k8s.AppsV1Api {
    return this.appsV1Api;
  }

  /**
   * Get the Custom Objects API client
   */
  getCustomObjectsApi(): k8s.CustomObjectsApi {
    return this.customObjectsApi;
  }

  /**
   * Get the list of namespaces to watch
   */
  getWatchNamespaces(): string[] {
    return this.watchNamespaces;
  }

  /**
   * Test connectivity to the Kubernetes API
   */
  async testConnectivity(): Promise<boolean> {
    try {
      await this.coreV1Api.listNamespace({});
      return true;
    } catch (error) {
      logger.error('Failed to connect to Kubernetes API', error as Error);
      return false;
    }
  }

  /**
   * Check if a namespace should be watched
   */
  shouldWatchNamespace(namespace: string): boolean {
    // If no specific namespaces are configured, watch all
    if (this.watchNamespaces.length === 0) {
      return true;
    }
    return this.watchNamespaces.includes(namespace);
  }

  /**
   * Create a watch for custom resources
   */
  async watchCustomResources(
    group: string,
    version: string,
    plural: string,
    callback: (phase: string, obj: any) => void
  ): Promise<any> {
    const watch = new k8s.Watch(this.kubeConfig);
    
    const watchPath = this.watchNamespaces.length === 1
      ? `/apis/${group}/${version}/namespaces/${this.watchNamespaces[0]}/${plural}`
      : `/apis/${group}/${version}/${plural}`;

    return watch.watch(
      watchPath,
      {},
      (phase: string, obj: any) => {
        // Filter by namespace if watching all namespaces
        if (this.watchNamespaces.length > 1 && obj.metadata?.namespace) {
          if (this.shouldWatchNamespace(obj.metadata.namespace)) {
            callback(phase, obj);
          }
        } else {
          callback(phase, obj);
        }
      },
      (error: any) => {
        logger.error(`Watch error for ${plural}`, error);
        // Automatically restart watch after error
        setTimeout(() => {
          logger.info(`Restarting watch for ${plural}`);
          this.watchCustomResources(group, version, plural, callback);
        }, 5000);
      }
    );
  }

  /**
   * Create or update a Kubernetes resource
   */
  async applyResource(
    apiVersion: string,
    kind: string,
    resource: any
  ): Promise<any> {
    const [group, version] = apiVersion.includes('/') 
      ? apiVersion.split('/')
      : ['', apiVersion];

    try {
      // Try to get the existing resource
      const namespace = resource.metadata.namespace || 'default';
      const name = resource.metadata.name;

      if (group) {
        // Custom resource
        const plural = `${kind.toLowerCase()}s`; // Simple pluralization
        try {
          await this.customObjectsApi.getNamespacedCustomObject({
            group,
            version,
            namespace,
            plural,
            name
          });
          // Resource exists, update it
          return await this.customObjectsApi.patchNamespacedCustomObject({
            group,
            version,
            namespace,
            plural,
            name,
            body: resource
          });
        } catch (error: any) {
          if (error.statusCode === 404) {
            // Resource doesn't exist, create it
            return await this.customObjectsApi.createNamespacedCustomObject({
              group,
              version,
              namespace,
              plural,
              body: resource
            });
          }
          throw error;
        }
      } else {
        // Core resource
        switch (kind) {
          case 'Secret':
            try {
              await this.coreV1Api.readNamespacedSecret({ name, namespace });
              return await this.coreV1Api.patchNamespacedSecret({
                name,
                namespace,
                body: resource
              });
            } catch (error: any) {
              if (error.statusCode === 404) {
                return await this.coreV1Api.createNamespacedSecret({ namespace, body: resource });
              }
              throw error;
            }
          case 'ConfigMap':
            try {
              await this.coreV1Api.readNamespacedConfigMap({ name, namespace });
              return await this.coreV1Api.patchNamespacedConfigMap({
                name,
                namespace,
                body: resource
              });
            } catch (error: any) {
              if (error.statusCode === 404) {
                return await this.coreV1Api.createNamespacedConfigMap({ namespace, body: resource });
              }
              throw error;
            }
          default:
            throw new Error(`Unsupported resource kind: ${kind}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to apply resource ${kind}/${resource.metadata.name}`, error as Error);
      throw error;
    }
  }
}

// Export singleton instance
let kubernetesService: KubernetesService | null = null;

try {
  kubernetesService = new KubernetesService();
} catch (error) {
  logger.warn('Kubernetes service initialization failed, running without K8s connectivity', error as Error);
}

export { kubernetesService };