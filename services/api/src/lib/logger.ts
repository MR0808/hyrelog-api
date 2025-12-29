import pino from 'pino';
import { loadConfig } from './config.js';

let loggerInstance: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  const config = loadConfig();

  loggerInstance = pino({
    level: config.logLevel,
    transport:
      config.nodeEnv === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  });

  return loggerInstance;
}

