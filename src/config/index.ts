export interface Config {
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  takaroApiUrl: string;
  takaroApiToken: string;
  kubeconfig?: string;
  namespace?: string;
  reconcileInterval: number;
}

export function loadConfig(): Config {
  const config: Config = {
    port: parseInt(process.env.PORT || '3000', 10),
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'info',
    takaroApiUrl: process.env.TAKARO_API_URL || 'https://api.takaro.dev',
    takaroApiToken: process.env.TAKARO_API_TOKEN || '',
    kubeconfig: process.env.KUBECONFIG,
    namespace: process.env.NAMESPACE,
    reconcileInterval: parseInt(process.env.RECONCILE_INTERVAL || '30000', 10),
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: Config): void {
  const errors: string[] = [];

  if (!config.takaroApiToken) {
    errors.push('TAKARO_API_TOKEN is required');
  }

  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (config.reconcileInterval < 1000) {
    errors.push('RECONCILE_INTERVAL must be at least 1000ms');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}