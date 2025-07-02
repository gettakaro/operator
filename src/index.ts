import { config } from './config/index.js';
import logger from './utils/logger.js';
import { createServer, startServer } from './server.js';
import { kubernetesService } from './services/kubernetes-service.js';

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason as Error, {
    promise: promise.toString(),
  });
  process.exit(1);
});

// Graceful shutdown handling
let shutdownInProgress = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownInProgress) {
    return;
  }
  
  shutdownInProgress = true;
  logger.info(`Received ${signal}, starting graceful shutdown`);

  try {
    // Add controller shutdown logic here when controllers are implemented
    logger.info('Shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Main function
async function main(): Promise<void> {
  logger.info('Starting Takaro Kubernetes Operator', {
    version: process.env.npm_package_version || '0.1.0',
    environment: config.nodeEnv,
    logLevel: config.operator.logLevel,
  });

  // Log configuration (excluding sensitive data)
  logger.debug('Configuration loaded', {
    kubernetes: {
      namespace: config.kubernetes.namespace,
      watchNamespaces: config.kubernetes.watchNamespaces,
    },
    operator: {
      healthPort: config.operator.healthPort,
      metricsPort: config.operator.metricsPort,
    },
    takaro: {
      apiUrl: config.takaro.apiUrl,
      hasApiToken: !!config.takaro.apiToken,
    },
  });

  try {
    // Test Kubernetes connectivity
    if (kubernetesService) {
      logger.info('Testing Kubernetes connectivity...');
      const k8sConnected = await kubernetesService.testConnectivity();
      
      if (!k8sConnected) {
        logger.warn('Failed to connect to Kubernetes API, continuing without K8s connectivity');
      } else {
        logger.info('Successfully connected to Kubernetes API');
      }
    } else {
      logger.warn('Kubernetes service not initialized, running without K8s connectivity');
    }

    // Start health server
    const app = createServer();
    await startServer(app);

    // TODO: Initialize and start controllers here
    logger.info('Operator initialization complete');

    // Keep the process running
    logger.info('Takaro Kubernetes Operator is running', {
      healthEndpoint: `http://localhost:${config.operator.healthPort}/health`,
      readinessEndpoint: `http://localhost:${config.operator.healthPort}/ready`,
      infoEndpoint: `http://localhost:${config.operator.healthPort}/info`,
    });

  } catch (error) {
    logger.error('Failed to start operator', error as Error);
    process.exit(1);
  }
}

// Start the operator
main().catch((error) => {
  logger.error('Fatal error in main function', error);
  process.exit(1);
});