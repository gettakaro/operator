import { existsSync } from 'fs';

export interface ApiClientConfig {
  url: string;
  token: string;
  timeout: number;
  retries: number;
  retryDelay: number;
  userAgent: string;
}

export interface WebhookConfig {
  enabled: boolean;
  port: number;
  path: string;
  secret?: string;
  tlsCert?: string;
  tlsKey?: string;
}

export interface RedisConfig {
  enabled: boolean;
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  tls?: boolean;
  keyPrefix: string;
}

export interface MetricsConfig {
  enabled: boolean;
  port: number;
  path: string;
  includeNodeMetrics: boolean;
  includeDefaultMetrics: boolean;
}

export interface OperatorConfig {
  namespace?: string;
  reconcileInterval: number;
  leaderElection: boolean;
  leaderElectionId: string;
  watchNamespaces?: string[];
  maxConcurrentReconciles: number;
}

export interface Config {
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: 'development' | 'production' | 'test';
  kubeconfig?: string;
  
  takaro: ApiClientConfig;
  webhook: WebhookConfig;
  redis: RedisConfig;
  metrics: MetricsConfig;
  operator: OperatorConfig;
  
  features: {
    domainController: boolean;
    mockServerController: boolean;
    userController: boolean;
  };
}

export function loadConfig(): Config {
  const nodeEnv = (process.env.NODE_ENV || 'development') as Config['nodeEnv'];
  
  const config: Config = {
    port: parseInt(process.env.PORT || '3000', 10),
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'info',
    nodeEnv,
    kubeconfig: process.env.KUBECONFIG,
    
    takaro: {
      url: process.env.TAKARO_API_URL || 'https://api.takaro.dev',
      token: process.env.TAKARO_API_TOKEN || '',
      timeout: parseInt(process.env.TAKARO_API_TIMEOUT || '30000', 10),
      retries: parseInt(process.env.TAKARO_API_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.TAKARO_API_RETRY_DELAY || '1000', 10),
      userAgent: process.env.TAKARO_API_USER_AGENT || 'takaro-kubernetes-operator/0.1.0',
    },
    
    webhook: {
      enabled: process.env.WEBHOOK_ENABLED === 'true',
      port: parseInt(process.env.WEBHOOK_PORT || '9443', 10),
      path: process.env.WEBHOOK_PATH || '/webhook',
      secret: process.env.WEBHOOK_SECRET,
      tlsCert: process.env.WEBHOOK_TLS_CERT,
      tlsKey: process.env.WEBHOOK_TLS_KEY,
    },
    
    redis: {
      enabled: process.env.REDIS_ENABLED === 'true',
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
      tls: process.env.REDIS_TLS === 'true',
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'takaro-operator:',
    },
    
    metrics: {
      enabled: process.env.METRICS_ENABLED !== 'false',
      port: parseInt(process.env.METRICS_PORT || '8080', 10),
      path: process.env.METRICS_PATH || '/metrics',
      includeNodeMetrics: process.env.METRICS_INCLUDE_NODE !== 'false',
      includeDefaultMetrics: process.env.METRICS_INCLUDE_DEFAULT !== 'false',
    },
    
    operator: {
      namespace: process.env.OPERATOR_NAMESPACE,
      reconcileInterval: parseInt(process.env.RECONCILE_INTERVAL || '30000', 10),
      leaderElection: process.env.LEADER_ELECTION === 'true',
      leaderElectionId: process.env.LEADER_ELECTION_ID || 'takaro-operator-leader',
      watchNamespaces: process.env.WATCH_NAMESPACES?.split(',').map(ns => ns.trim()).filter(Boolean),
      maxConcurrentReconciles: parseInt(process.env.MAX_CONCURRENT_RECONCILES || '3', 10),
    },
    
    features: {
      domainController: process.env.FEATURE_DOMAIN_CONTROLLER !== 'false',
      mockServerController: process.env.FEATURE_MOCKSERVER_CONTROLLER !== 'false',
      userController: process.env.FEATURE_USER_CONTROLLER !== 'false',
    },
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: Config): void {
  const errors: string[] = [];

  // Basic validations
  if (!config.takaro.token) {
    errors.push('TAKARO_API_TOKEN is required');
  }

  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Takaro API validations
  try {
    new URL(config.takaro.url);
  } catch {
    errors.push('TAKARO_API_URL must be a valid URL');
  }

  if (config.takaro.timeout < 1000) {
    errors.push('TAKARO_API_TIMEOUT must be at least 1000ms');
  }

  if (config.takaro.retries < 0 || config.takaro.retries > 10) {
    errors.push('TAKARO_API_RETRIES must be between 0 and 10');
  }

  // Webhook validations
  if (config.webhook.enabled) {
    if (config.webhook.port < 1 || config.webhook.port > 65535) {
      errors.push('WEBHOOK_PORT must be between 1 and 65535');
    }

    if (config.webhook.tlsCert && !existsSync(config.webhook.tlsCert)) {
      errors.push(`WEBHOOK_TLS_CERT file not found: ${config.webhook.tlsCert}`);
    }

    if (config.webhook.tlsKey && !existsSync(config.webhook.tlsKey)) {
      errors.push(`WEBHOOK_TLS_KEY file not found: ${config.webhook.tlsKey}`);
    }

    if ((config.webhook.tlsCert && !config.webhook.tlsKey) || (!config.webhook.tlsCert && config.webhook.tlsKey)) {
      errors.push('Both WEBHOOK_TLS_CERT and WEBHOOK_TLS_KEY must be provided together');
    }
  }

  // Redis validations
  if (config.redis.enabled) {
    if (!config.redis.url && !config.redis.host) {
      errors.push('Either REDIS_URL or REDIS_HOST must be provided when Redis is enabled');
    }

    if (config.redis.port && (config.redis.port < 1 || config.redis.port > 65535)) {
      errors.push('REDIS_PORT must be between 1 and 65535');
    }

    if (config.redis.db !== undefined && (config.redis.db < 0 || config.redis.db > 15)) {
      errors.push('REDIS_DB must be between 0 and 15');
    }
  }

  // Metrics validations
  if (config.metrics.enabled) {
    if (config.metrics.port < 1 || config.metrics.port > 65535) {
      errors.push('METRICS_PORT must be between 1 and 65535');
    }

    if (!config.metrics.path.startsWith('/')) {
      errors.push('METRICS_PATH must start with /');
    }
  }

  // Operator validations
  if (config.operator.reconcileInterval < 1000) {
    errors.push('RECONCILE_INTERVAL must be at least 1000ms');
  }

  if (config.operator.maxConcurrentReconciles < 1 || config.operator.maxConcurrentReconciles > 100) {
    errors.push('MAX_CONCURRENT_RECONCILES must be between 1 and 100');
  }

  // Feature validations
  if (!config.features.domainController && !config.features.mockServerController && !config.features.userController) {
    errors.push('At least one controller must be enabled');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

export function getRedisConnectionString(config: RedisConfig): string | undefined {
  if (!config.enabled) return undefined;
  
  if (config.url) return config.url;
  
  const protocol = config.tls ? 'rediss' : 'redis';
  const auth = config.password ? `:${config.password}@` : '';
  const host = config.host || 'localhost';
  const port = config.port || 6379;
  const db = config.db !== undefined ? `/${config.db}` : '';
  
  return `${protocol}://${auth}${host}:${port}${db}`;
}