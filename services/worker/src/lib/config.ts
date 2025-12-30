import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Load environment variables from .env file in the repo root
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const rootDir = resolve(currentDir, '..', '..', '..', '..');
loadDotenv({ path: resolve(rootDir, '.env') });

const RegionSchema = z.enum(['US', 'EU', 'UK', 'AU']);

const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Default region
  defaultDataRegion: RegionSchema.default('US'),

  // Database URLs per region
  databaseUrlUs: z.string().url(),
  databaseUrlEu: z.string().url(),
  databaseUrlUk: z.string().url(),
  databaseUrlAu: z.string().url(),

  // Worker polling interval (seconds)
  workerPollIntervalSeconds: z.coerce.number().default(5),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Region = z.infer<typeof RegionSchema>;

let config: Config | null = null;

export function loadConfig(): Config {
  if (config) {
    return config;
  }

  const raw = {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    defaultDataRegion: process.env.DEFAULT_DATA_REGION,
    databaseUrlUs: process.env.DATABASE_URL_US,
    databaseUrlEu: process.env.DATABASE_URL_EU,
    databaseUrlUk: process.env.DATABASE_URL_UK,
    databaseUrlAu: process.env.DATABASE_URL_AU,
    workerPollIntervalSeconds: process.env.WORKER_POLL_INTERVAL_SECONDS,
  };

  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  config = result.data;
  return config;
}

export function getDatabaseUrl(region: Region): string {
  const cfg = loadConfig();
  switch (region) {
    case 'US':
      return cfg.databaseUrlUs;
    case 'EU':
      return cfg.databaseUrlEu;
    case 'UK':
      return cfg.databaseUrlUk;
    case 'AU':
      return cfg.databaseUrlAu;
  }
}

