import { z } from 'zod';
import 'dotenv/config';

const configSchema = z.object({
  port: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(65535))
    .default('3000'),
  logLevel: z
    .enum(['debug', 'info', 'warn', 'error'], {
      errorMap: () => ({ message: 'LOG_LEVEL must be one of: debug, info, warn, error' }),
    })
    .default('info'),
  takaroApiUrl: z.string().url('TAKARO_API_URL must be a valid URL').default('https://api.takaro.dev'),
  takaroApiToken: z.string().min(1, 'TAKARO_API_TOKEN is required'),
  kubeconfig: z.string().optional(),
  namespace: z.string().optional(),
  reconcileInterval: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1000, 'RECONCILE_INTERVAL must be at least 1000ms'))
    .default('30000'),
});

export type Config = z.infer<typeof configSchema>;

export { configSchema };

export function loadConfig(): Config {
  const rawConfig = {
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    takaroApiUrl: process.env.TAKARO_API_URL,
    takaroApiToken: process.env.TAKARO_API_TOKEN,
    kubeconfig: process.env.KUBECONFIG,
    namespace: process.env.NAMESPACE,
    reconcileInterval: process.env.RECONCILE_INTERVAL,
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('\n');
      throw new Error(`Configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}
