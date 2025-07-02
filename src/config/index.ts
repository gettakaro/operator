import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: join(__dirname, '../../.env') });

// Define the configuration schema using Zod
const configSchema = z
  .object({
    // Takaro API Configuration
    takaro: z.object({
      apiUrl: z.string().url().default('https://api.takaro.dev'),
      apiToken: z.string().default(''),
    }),

    // Kubernetes Configuration
    kubernetes: z.object({
      namespace: z.string().min(1).default('takaro-system'),
      watchNamespaces: z
        .string()
        .default('')
        .transform((val) => {
          if (!val) return [];
          return val
            .split(',')
            .map((ns) => ns.trim())
            .filter((ns) => ns.length > 0);
        }),
    }),

    // Redis Configuration
    redis: z.object({
      host: z.string().min(1).default('redis'),
      port: z.coerce.number().int().positive().default(6379),
      password: z.string().optional(),
    }),

    // Operator Configuration
    operator: z.object({
      logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
      metricsPort: z.coerce.number().int().positive().default(15090),
      healthPort: z.coerce.number().int().positive().default(15080),
    }),

    // Environment
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  })
  .transform((data) => ({
    ...data,
    isDevelopment: data.nodeEnv === 'development',
    isProduction: data.nodeEnv === 'production',
  }))
  .refine((data) => !data.isProduction || data.takaro.apiToken !== '', {
    message: 'TAKARO_API_TOKEN is required in production',
    path: ['takaro', 'apiToken'],
  });

// Infer the TypeScript type from the schema
export type Config = z.infer<typeof configSchema>;

// Parse and validate the configuration
function getConfig(): Config {
  try {
    // Map environment variables to the schema structure
    const rawConfig = {
      takaro: {
        apiUrl: process.env.TAKARO_API_URL,
        apiToken: process.env.TAKARO_API_TOKEN,
      },
      kubernetes: {
        namespace: process.env.KUBERNETES_NAMESPACE,
        watchNamespaces: process.env.WATCH_NAMESPACES,
      },
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD,
      },
      operator: {
        logLevel: process.env.LOG_LEVEL,
        metricsPort: process.env.METRICS_PORT,
        healthPort: process.env.HEALTH_PORT,
      },
      nodeEnv: process.env.NODE_ENV,
    };

    // Parse and validate the configuration
    const config = configSchema.parse(rawConfig);

    // Configuration loaded successfully

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      console.error(JSON.stringify(error.format(), null, 2));
      throw new Error(
        `Invalid configuration: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      );
    }
    throw error;
  }
}

export const config = getConfig();
