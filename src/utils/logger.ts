import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
const logger = winston.createLogger({
  level: config.operator.logLevel,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
  ),
  defaultMeta: { service: 'takaro-operator' },
  transports: [],
});

// Add console transport based on environment
if (config.isDevelopment) {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      devFormat
    ),
  }));
} else {
  logger.add(new winston.transports.Console({
    format: combine(json()),
  }));
}

// Export logger instance
export default logger;

// Helper functions for structured logging
export function logError(message: string, error: Error, metadata?: Record<string, unknown>): void {
  logger.error(message, {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...metadata,
  });
}

export function logInfo(message: string, metadata?: Record<string, unknown>): void {
  logger.info(message, metadata);
}

export function logDebug(message: string, metadata?: Record<string, unknown>): void {
  logger.debug(message, metadata);
}

export function logWarning(message: string, metadata?: Record<string, unknown>): void {
  logger.warn(message, metadata);
}