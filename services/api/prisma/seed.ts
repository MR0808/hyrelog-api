import { PrismaClient } from '../node_modules/.prisma/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { hashApiKey, generateApiKey } from '../src/lib/apiKey.js';
import { loadConfig, getDatabaseUrl } from '../src/lib/config.js';

/**
 * Seed script for Phase 2
 * 
 * Creates:
 * - A Company (default region US, plan tier from SEED_PLAN_TIER env or FREE)
 * - A Workspace
 * - A Project
 * - A Company key
 * - A Workspace key
 * 
 * Prints plaintext keys to console (shown only once)
 * 
 * Set SEED_PLAN_TIER=GROWTH or SEED_PLAN_TIER=ENTERPRISE to test webhooks
 */
async function seed() {
  const config = loadConfig();
  const region = config.defaultDataRegion;
  const databaseUrl = getDatabaseUrl(region);

  // Create Prisma client for the region
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = new PrismaClient({ adapter } as any);

  try {
    console.log('🌱 Seeding database...\n');
    
    // Check if migrations have been run by trying to query a new column
    try {
      await prisma.$queryRaw`SELECT "planTier" FROM companies LIMIT 1`;
    } catch (error: any) {
      if (error.code === '42703' || error.code === 'P2021') {
        console.error('❌ ERROR: Database migrations have not been run yet!\n');
        console.error('Please run migrations first:\n');
        console.error('  1. npm run prisma:migrate:all');
        console.error('  2. npm run prisma:generate');
        console.error('  3. Then run this seed script again\n');
        process.exit(1);
      }
      throw error;
    }
    
    console.log('⚠️  Clearing existing data...\n');

    // Clear existing data in reverse dependency order
    // Wrap in try-catch to handle missing tables (if migrations haven't been run)
    try {
      await prisma.webhookDeliveryAttempt.deleteMany({});
    } catch (error: any) {
      if (error.code === 'P2021') {
        // Table doesn't exist - migrations not run yet, skip
        console.log('⚠️  Webhook tables not found (migrations may not be run yet)');
      } else {
        throw error;
      }
    }

    try {
      await prisma.webhookJob.deleteMany({});
    } catch (error: any) {
      if (error.code === 'P2021') {
        // Table doesn't exist - skip
      } else {
        throw error;
      }
    }

    try {
      await prisma.webhookEndpoint.deleteMany({});
    } catch (error: any) {
      if (error.code === 'P2021') {
        // Table doesn't exist - skip
      } else {
        throw error;
      }
    }

    await prisma.auditEvent.deleteMany({});
    await prisma.gdprApproval.deleteMany({});
    await prisma.gdprRequest.deleteMany({});
    await prisma.archiveObject.deleteMany({});
    await prisma.apiKey.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.companyMember.deleteMany({});
    await prisma.company.deleteMany({});

    console.log('✅ Cleared existing data\n');

    // Determine plan tier from environment (default: FREE)
    const planTier = (process.env.SEED_PLAN_TIER || 'FREE').toUpperCase() as 'FREE' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';
    if (!['FREE', 'STARTER', 'GROWTH', 'ENTERPRISE'].includes(planTier)) {
      throw new Error(`Invalid SEED_PLAN_TIER: ${planTier}. Must be FREE, STARTER, GROWTH, or ENTERPRISE`);
    }

    // Determine billing status and trial end
    // FREE: billingStatus=ACTIVE (no trial)
    // Paid tiers: billingStatus=TRIALING, trialEndsAt=now+14days
    const isFree = planTier === 'FREE';
    const billingStatus = isFree ? 'ACTIVE' : 'TRIALING';
    const trialEndsAt = isFree ? null : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // +14 days

    // Create Company
    const company = await prisma.company.create({
      data: {
        name: 'Acme Corp',
        dataRegion: region,
        planTier,
        billingStatus,
        trialEndsAt,
      },
    });
    console.log(`✅ Created company: ${company.id} (${company.name})`);
    console.log(`   Plan: ${company.planTier}`);
    console.log(`   Billing Status: ${company.billingStatus}`);
    if (company.trialEndsAt) {
      console.log(`   Trial Ends: ${company.trialEndsAt.toISOString()}`);
    }

    // Create Company Member (admin)
    const member = await prisma.companyMember.create({
      data: {
        companyId: company.id,
        email: 'admin@acme.com',
        role: 'ADMIN',
      },
    });
    console.log(`✅ Created company member: ${member.email}`);

    // Create Workspace
    const workspace = await prisma.workspace.create({
      data: {
        companyId: company.id,
        name: 'Production',
      },
    });
    console.log(`✅ Created workspace: ${workspace.id} (${workspace.name})`);

    // Create Project
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: 'Main App',
      },
    });
    console.log(`✅ Created project: ${project.id} (${project.name})`);

    // Create Company Key
    // IMPORTANT: Add IP allowlist for key management operations (webhooks, key creation, etc.)
    const companyKeyPlaintext = generateApiKey('COMPANY');
    const companyKeyHashed = hashApiKey(companyKeyPlaintext);
    const companyKey = await prisma.apiKey.create({
      data: {
        prefix: companyKeyPlaintext.substring(0, 20),
        hashedKey: companyKeyHashed,
        scope: 'COMPANY',
        status: 'ACTIVE',
        companyId: company.id,
        labels: ['seed-company-key'],
        ipAllowlist: ['127.0.0.1', '::1'], // Localhost IPs for local development
      },
    });
    console.log(`✅ Created company API key: ${companyKey.id}`);

    // Create Workspace Key
    const workspaceKeyPlaintext = generateApiKey('WORKSPACE');
    const workspaceKeyHashed = hashApiKey(workspaceKeyPlaintext);
    const workspaceKey = await prisma.apiKey.create({
      data: {
        prefix: workspaceKeyPlaintext.substring(0, 20),
        hashedKey: workspaceKeyHashed,
        scope: 'WORKSPACE',
        status: 'ACTIVE',
        companyId: company.id,
        workspaceId: workspace.id,
        labels: ['seed-workspace-key'],
      },
    });
    console.log(`✅ Created workspace API key: ${workspaceKey.id}`);

    console.log('\n🔑 API Keys (save these - shown only once!):\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('COMPANY KEY (read/export across all workspaces):');
    console.log(companyKeyPlaintext);
    console.log('\nWORKSPACE KEY (ingest + read within workspace):');
    console.log(workspaceKeyPlaintext);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('\n✅ Seeding complete!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Company Information:');
    console.log(`   Company ID: ${company.id}`);
    console.log(`   Workspace ID: ${workspace.id}`);
    console.log(`   Project ID: ${project.id}`);
    console.log(`   Plan Tier: ${company.planTier}`);
    console.log(`   Billing Status: ${company.billingStatus}`);
    if (company.trialEndsAt) {
      console.log(`   Trial Ends: ${company.trialEndsAt.toISOString()}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Plan-specific feature hints
    if (company.planTier === 'GROWTH' || company.planTier === 'ENTERPRISE') {
      console.log('💡 Webhooks are enabled for this plan tier!');
      console.log('   Create a webhook endpoint to receive event notifications.\n');
    } else if (company.planTier === 'STARTER') {
      console.log('💡 Streaming exports are enabled for this plan tier!');
      console.log('   Webhooks require Growth plan or higher.\n');
    } else {
      console.log('💡 Set SEED_PLAN_TIER=STARTER|GROWTH|ENTERPRISE to test paid features.\n');
    }
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

