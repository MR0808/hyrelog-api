/**
 * Prisma 7 Configuration File
 * 
 * This file provides the datasource URL for Prisma Migrate.
 * The DATABASE_URL environment variable is set by the migration script.
 */

export default {
  datasource: {
    url: process.env.DATABASE_URL || '',
  },
};

