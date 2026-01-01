/**
 * Unmark Cold Archived Objects
 * 
 * For testing purposes: Unmarks ArchiveObjects as cold archived so they can be exported.
 * 
 * In production with AWS S3, you would need to restore objects from Glacier first.
 * This script is for local development with MinIO where there's no actual Glacier.
 * 
 * Usage:
 *   node scripts/unmark-cold-archived.js [region] [companyId]
 * 
 * Examples:
 *   node scripts/unmark-cold-archived.js us <company-id>
 *   node scripts/unmark-cold-archived.js eu <company-id>
 */

import { getRegionRouter } from '../services/worker/src/lib/regionRouter.js';
import { getLogger } from '../services/worker/src/lib/logger.js';
import type { Region } from '../services/worker/src/lib/config.js';

const logger = getLogger();

const region = (process.argv[2] || 'us').toLowerCase();
const companyId = process.argv[3];

if (!companyId) {
  console.error('Usage: node scripts/unmark-cold-archived.js [region] <company-id>');
  console.error('Example: node scripts/unmark-cold-archived.js us abc123');
  process.exit(1);
}

if (!['us', 'eu', 'ap'].includes(region)) {
  console.error(`Invalid region: ${region}. Must be one of: us, eu, ap`);
  process.exit(1);
}

async function main() {
  const router = getRegionRouter();
  const prisma = router.getPrisma(region);

  try {
    // Find all cold archived objects for this company
    const coldArchived = await prisma.archiveObject.findMany({
      where: {
        companyId: companyId,
        region: region,
        isColdArchived: true,
      },
    });

    console.log(`Found ${coldArchived.length} cold archived objects for company ${companyId} in region ${region}`);

    if (coldArchived.length === 0) {
      console.log('No cold archived objects to unmark.');
      return;
    }

    // Unmark them
    const result = await prisma.archiveObject.updateMany({
      where: {
        companyId: companyId,
        region: region,
        isColdArchived: true,
      },
      data: {
        isColdArchived: false,
        coldArchiveKey: null,
      },
    });

    console.log(`✅ Unmarked ${result.count} archive objects as cold archived`);
    console.log('They can now be exported via the export API.');
  } catch (error) {
    logger.error({ err: error }, 'Error unmarking cold archived objects');
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
