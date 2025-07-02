import express, { Express, Request, Response, NextFunction } from 'express';
import { config } from './config/index.js';
import logger from './utils/logger.js';
import { kubernetesService } from './services/kubernetes-service.js';

export function createServer(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.debug(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    });
    next();
  });

  // Health check endpoint (liveness probe)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    });
  });

  // Readiness probe endpoint
  app.get('/ready', async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check Kubernetes connectivity
      const k8sConnected = kubernetesService ? await kubernetesService.testConnectivity() : false;
      
      if (!k8sConnected) {
        res.status(503).json({
          status: 'not ready',
          reason: 'Cannot connect to Kubernetes API',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if we have a Takaro API token in production
      if (config.isProduction && !config.takaro.apiToken) {
        res.status(503).json({
          status: 'not ready',
          reason: 'Takaro API token not configured',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: {
          kubernetes: 'connected',
          configuration: 'valid',
        },
      });
    } catch (error) {
      logger.error('Readiness check failed', error as Error);
      res.status(503).json({
        status: 'not ready',
        reason: 'Internal error during readiness check',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Basic info endpoint
  app.get('/info', (_req: Request, res: Response) => {
    res.json({
      name: 'takaro-kubernetes-operator',
      version: process.env.npm_package_version || '0.1.0',
      environment: config.nodeEnv,
      watchNamespaces: kubernetesService?.getWatchNamespaces() || [],
      operatorNamespace: config.kubernetes.namespace,
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error in Express', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: config.isDevelopment ? err.message : 'An error occurred',
    });
  });

  return app;
}

export async function startServer(app: Express): Promise<void> {
  const port = config.operator.healthPort;
  
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info(`Health server listening on port ${port}`, {
        endpoints: ['/health', '/ready', '/info'],
      });
      resolve();
    });

    server.on('error', (error) => {
      logger.error('Failed to start health server', error);
      reject(error);
    });
  });
}