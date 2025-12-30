# Fix: IP Allowlist Required for Key Management

## The Problem

You're getting this error when trying to create a webhook:

```json
{
  "error": "Company keys used for key management must have IP allowlist configured. Please configure IP allowlist via dashboard.",
  "code": "FORBIDDEN"
}
```

## Why This Happens

**Security Requirement:** Company keys used for sensitive operations (like creating webhooks, creating workspace keys, rotating keys) **must** have an IP allowlist configured. This prevents unauthorized access if the key is compromised.

## Quick Fix Options

### Option 1: Re-run Seed Script (Easiest)

The seed script has been updated to automatically add IP allowlist. Just re-seed:

```powershell
$env:SEED_PLAN_TIER="GROWTH"
npm run seed
```

This will create a new company key with IP allowlist already configured for localhost (`127.0.0.1` and `::1`).

**Note:** This will delete all existing data and create fresh test data.

### Option 2: Update Existing Key via Prisma Studio

If you want to keep your existing data:

1. **Open Prisma Studio:**
   ```powershell
   npm run prisma:studio
   ```

2. **Navigate to `api_keys` table**

3. **Find your company key** (look for `scope = COMPANY`)

4. **Edit the `ipAllowlist` field:**
   - Change from `[]` (empty array) to `["127.0.0.1", "::1"]`
   - Or add your actual IP address if testing from a different machine

5. **Save the changes**

6. **Try creating webhook again in Postman**

### Option 3: Update via Direct SQL (Advanced)

If you prefer SQL:

```sql
-- Connect to your database (US region example)
-- Update company key to include localhost IPs
UPDATE api_keys 
SET "ipAllowlist" = ARRAY['127.0.0.1', '::1']::text[]
WHERE scope = 'COMPANY' 
  AND "companyId" = 'your-company-id-here';
```

## Understanding IP Allowlist

### What It Does

The IP allowlist restricts which IP addresses can use the API key. Only requests coming from IPs in the allowlist will be accepted.

### For Local Development

- `127.0.0.1` - IPv4 localhost
- `::1` - IPv6 localhost

These allow requests from your local machine.

### For Production

In production, you'd add:
- Your server's IP address
- Your CI/CD pipeline IPs
- Your office IP range

**Example:**
```json
["203.0.113.42", "198.51.100.0/24"]
```

### Testing from Different Machine

If you're testing from a different machine (not localhost):

1. Find your IP address:
   ```powershell
   # Windows
   ipconfig
   # Look for IPv4 Address (e.g., 192.168.1.100)
   ```

2. Add it to the allowlist in Prisma Studio or seed script

## Why This Security Exists

**Key Management Operations** (creating webhooks, creating keys, rotating keys) are sensitive because:
- They can create new API keys
- They can modify security settings
- They can enable/disable features

**IP Allowlist adds a layer of security:**
- Even if someone steals your API key, they can't use it unless they're also on an allowed IP
- Prevents key misuse from compromised machines
- Provides defense-in-depth

## Verification

After fixing, verify it works:

1. **Check key status:**
   ```powershell
   # In Postman: V1 API > Keys > Get Key Status
   # Should show ipAllowlist in response (if you have access to that field)
   ```

2. **Try creating webhook:**
   ```powershell
   # In Postman: V1 API > Webhooks > Create Webhook
   # Should now succeed (if plan is Growth+)
   ```

## Common Issues

### Issue: "IP address X is not allowed"

**Cause:** Your current IP is not in the allowlist.

**Fix:** Add your IP to the allowlist:
- Check your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Add it to `ipAllowlist` array in Prisma Studio

### Issue: "IP allowlist is empty"

**Cause:** The key was created without IP allowlist.

**Fix:** Use Option 1 or 2 above to add IPs.

### Issue: "Works from Postman but not from my app"

**Cause:** Your app is running on a different IP than localhost.

**Fix:** Add your app's IP address to the allowlist.

## Best Practices

1. **Always set IP allowlist for company keys** used for key management
2. **Use specific IPs** in production (not `0.0.0.0/0`)
3. **Rotate keys** if IP allowlist is compromised
4. **Monitor key usage** for unexpected IPs

## Summary

**The Fix:**
1. Re-run seed script (easiest), OR
2. Update existing key in Prisma Studio to add `["127.0.0.1", "::1"]` to `ipAllowlist`

**Why:**
- Security requirement for sensitive operations
- Prevents unauthorized key usage
- Defense-in-depth security measure

