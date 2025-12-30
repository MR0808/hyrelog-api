#!/usr/bin/env node

/**
 * Simple webhook receiver for testing
 * 
 * Usage:
 *   node tools/webhook-receiver.js [port]
 * 
 * Default port: 3001
 * 
 * This server receives webhook POST requests and logs them to console.
 * Useful for testing webhook delivery locally.
 */

const http = require('http');
const crypto = require('crypto');

const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 3001;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';

  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    const timestamp = new Date().toISOString();
    const signature = req.headers['x-hyrelog-signature'];
    const deliveryId = req.headers['x-hyrelog-delivery-id'];
    const attempt = req.headers['x-hyrelog-attempt'];
    const traceId = req.headers['x-trace-id'];

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📨 Webhook Received - ${timestamp}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Delivery ID: ${deliveryId}`);
    console.log(`Attempt: ${attempt}`);
    console.log(`Trace ID: ${traceId || 'N/A'}`);
    console.log(`Signature: ${signature || 'N/A'}`);
    console.log('\nHeaders:');
    console.log(JSON.stringify(req.headers, null, 2));
    console.log('\nBody:');
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(body);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verify signature if secret is provided
    if (process.env.WEBHOOK_SECRET && signature) {
      const secret = process.env.WEBHOOK_SECRET;
      const providedSig = signature.replace(/^v1=/, '');
      const computedSig = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      if (providedSig === computedSig) {
        console.log('✅ Signature verified\n');
      } else {
        console.log('❌ Signature verification failed\n');
      }
    }

    // Return 200 OK
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Received-At': timestamp,
    });
    res.end(JSON.stringify({
      received: true,
      timestamp,
      deliveryId,
      attempt,
    }));
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Webhook receiver listening on http://localhost:${PORT}`);
  console.log(`\nTo test webhook delivery:`);
  console.log(`  1. Create a webhook endpoint pointing to: http://localhost:${PORT}`);
  console.log(`  2. Ingest an event using the API`);
  console.log(`  3. Watch this console for webhook deliveries\n`);
  if (process.env.WEBHOOK_SECRET) {
    console.log(`✅ Signature verification enabled (WEBHOOK_SECRET set)\n`);
  } else {
    console.log(`⚠️  Signature verification disabled (set WEBHOOK_SECRET to enable)\n`);
  }
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down webhook receiver...');
  server.close(() => {
    process.exit(0);
  });
});

