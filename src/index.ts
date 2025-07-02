import express from 'express';
import * as k8s from '@kubernetes/client-node';
import { loadConfig } from './config/index.js';
import { ControllerRegistry } from './controllers/registry.js';
import { DomainController } from './controllers/domain-controller.js';

const config = loadConfig();
const app = express();

let kc: k8s.KubeConfig;
let kubeApi: k8s.CoreV1Api;
let customObjectsApi: k8s.CustomObjectsApi;
let controllerRegistry: ControllerRegistry;
let isReady = false;

async function initializeKubernetesClient(): Promise<void> {
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
    
    // Register Domain controller
    if (config.features.domainController) {
      const domainController = new DomainController(kc, config.operator.namespace);
      controllerRegistry.register('domain', domainController);
    }
    
    // Start all controllers
    await controllerRegistry.startAll();
    
    isReady = true;
    console.log('All controllers registered and started successfully');
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
    version: process.env.npm_package_version || 'unknown'
  });
});

app.get('/ready', (_req, res) => {
  if (isReady) {
    res.status(200).json({ 
      status: 'ready',
      timestamp: new Date().toISOString(),
      kubernetesConnected: !!kubeApi
    });
  } else {
    res.status(503).json({ 
      status: 'not ready',
      timestamp: new Date().toISOString(),
      kubernetesConnected: !!kubeApi
    });
  }
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('# Metrics endpoint placeholder - will be implemented in future tasks\n');
});

app.get('/controllers', (_req, res) => {
  if (!controllerRegistry) {
    res.status(503).json({ 
      status: 'not ready',
      message: 'Controller registry not initialized'
    });
    return;
  }
  
  res.status(200).json({
    status: 'ok',
    controllers: controllerRegistry.getStatus(),
    timestamp: new Date().toISOString()
  });
});

async function startOperator(): Promise<void> {
  try {
    console.log('Starting Takaro Kubernetes Operator...');
    console.log('Configuration:', {
      port: config.port,
      logLevel: config.logLevel,
      nodeEnv: config.nodeEnv,
      takaroApiUrl: config.takaro.url,
      namespace: config.operator.namespace || 'all namespaces',
      reconcileInterval: config.operator.reconcileInterval,
      features: config.features
    });

    await initializeKubernetesClient();
    await registerControllers();

    const server = app.listen(config.port, () => {
      console.log(`Operator listening on port ${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/health`);
      console.log(`Readiness check: http://localhost:${config.port}/ready`);
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      
      // Stop accepting new connections
      server.close(async () => {
        console.log('HTTP server closed');
        
        // Stop all controllers
        if (controllerRegistry) {
          await controllerRegistry.stopAll();
        }
        
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start operator:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startOperator();
}

export { kc, kubeApi, customObjectsApi, config, controllerRegistry };