# Quick Fix: Missing WEBHOOK_SECRET_ENCRYPTION_KEY

## The Error

```
WEBHOOK_SECRET_ENCRYPTION_KEY environment variable is required
```

## The Fix

Add this line to your `.env` file in the repository root:

### Step 1: Generate a Key

Run this command to generate a secure 64-character hex key:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This will output something like:
```
1567a874a5992f3fe3523d970e5b178917285128266f7a039f2c289e04e1cd1f
```

### Step 2: Add to .env

Open your `.env` file (in the repository root) and add:

```env
WEBHOOK_SECRET_ENCRYPTION_KEY=1567a874a5992f3fe3523d970e5b178917285128266f7a039f2c289e04e1cd1f
```

**Replace the value** with the key you generated in Step 1.

### Step 3: Restart API Server

After adding the key, restart your API server:

```powershell
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## What This Key Does

This key is used to **encrypt webhook secrets** before storing them in the database. 

- **Webhook secrets** are used to sign webhook payloads (HMAC-SHA256)
- Secrets are **encrypted at rest** in the database using AES-256-GCM
- This key is the master encryption key for all webhook secrets

## Security Notes

- **Keep this key secret** - don't commit it to git (it should be in `.env`, which is in `.gitignore`)
- **Use different keys** for development and production
- **In production**, consider using AWS Secrets Manager or similar instead of environment variables

## Verify It Works

After adding the key and restarting:

1. Try creating a webhook in Postman
2. Should now succeed (if you have Growth+ plan and IP allowlist configured)

## Alternative: Use Existing Key

If you already have a key from a previous setup, you can reuse it. Just make sure it's:
- Exactly 64 hex characters (32 bytes)
- Different from your `API_KEY_SECRET` (they serve different purposes)

