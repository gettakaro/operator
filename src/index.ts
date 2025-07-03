import express from 'express';
import * as k8s from '@kubernetes/client-node';
import { loadConfig } from './config/index.js';
import { ControllerRegistry } from './controllers/registry.js';
import { DomainController } from './controllers/domain-controller.js';

const config = loadConfig();
const app = express();

let kubeApi: k8s.CoreV1Api;
let customObjectsApi: k8s.CustomObjectsApi;
let controllerRegistry: ControllerRegistry;
let kc: k8s.KubeConfig;
let isReady = false;

function initializeKubernetesClient(): void {
  try {
    kc = new k8s.KubeConfig();

    if (config.kubeconfig) {
      kc.loadFromFile(config.kubeconfig);
    } else if (process.env.KUBERNETES_SERVICE_HOST) {
      kc.loadFromCluster();
    } else {
      kc.loadFromDefault();
    }

    kubeApi = kc.makeApiClient(k8s.CoreV1Api);
    customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);

    console.log('Kubernetes client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Kubernetes client:', error);
    throw error;
  }
}

async function registerControllers(): Promise<void> {
  try {
    console.log('Registering controllers...');
    
    controllerRegistry = new ControllerRegistry(kc);
    
    const domainController = new DomainController(kc, config.namespace);
    controllerRegistry.register('domain', domainController);
    
    await controllerRegistry.startAll();
    
    console.log('All controllers registered and started');
    isReady = true;
  } catch (error) {
    console.error('Failed to register controllers:', error);
    throw error;
  }
}

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
  });
});

app.get('/ready', (_req, res) => {
  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      kubernetesConnected: !!kubeApi,
      controllers: controllerRegistry?.getStatus() || {},
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      kubernetesConnected: !!kubeApi,
      controllers: controllerRegistry?.getStatus() || {},
    });
  }
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# Metrics endpoint placeholder - will be implemented in future tasks\n');
});

async function startOperator(): Promise<void> {
  try {
    console.log('Starting Takaro Kubernetes Operator...');
    console.log('Configuration:', {
      port: config.port,
      logLevel: config.logLevel,
      takaroApiUrl: config.takaroApiUrl,
      namespace: config.namespace || 'all namespaces',
      reconcileInterval: config.reconcileInterval,
    });

    initializeKubernetesClient();
    await registerControllers();

    const server = app.listen(config.port, () => {
      console.log(`Operator listening on port ${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/health`);
      console.log(`Readiness check: http://localhost:${config.port}/ready`);
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      
      if (controllerRegistry) {
        console.log('Stopping all controllers...');
        await controllerRegistry.stopAll();
      }
      
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start operator:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startOperator();
}

export { kubeApi, customObjectsApi, config };
