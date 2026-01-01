# BigInt Handling for maxExportRows

## Overview

The `maxExportRows` field is stored as `BigInt` in the database to support values exceeding `Number.MAX_SAFE_INTEGER` (2^53 - 1 = 9,007,199,254,740,991).

## Why BigInt?

JavaScript's `Number` type uses IEEE 754 double-precision floating-point format, which can only safely represent integers up to `Number.MAX_SAFE_INTEGER`. For enterprise plans that may need to support exports of billions or trillions of rows, we use `BigInt` to avoid precision loss.

## Implementation

### Database Schema

```prisma
model Plan {
  maxExportRows BigInt @default(10000)
}
```

### TypeScript Interface

```typescript
export interface PlanConfig {
  maxExportRows: bigint; // BigInt, not number
  // ... other fields
}
```

### Hardcoded Configs

All plan configurations use `BigInt`:

```typescript
const PLAN_CONFIGS = {
  FREE: {
    maxExportRows: BigInt(10_000),
  },
  STARTER: {
    maxExportRows: BigInt(250_000),
  },
  GROWTH: {
    maxExportRows: BigInt(1_000_000),
  },
  ENTERPRISE: {
    maxExportRows: BigInt('999999999999'), // Safe as BigInt
  },
};
```

### Seed Script

Seed script uses `BigInt` consistently:

```typescript
await prisma.plan.create({
  data: {
    maxExportRows: BigInt(10000), // Use BigInt
  },
});
```

## Handling Comparisons

### ✅ Correct: BigInt Comparison

```typescript
// When comparing maxExportRows
const limit = getLimit(planTier, 'maxExportRows'); // Returns bigint
const currentValue = BigInt(requestedRows); // Convert to BigInt

if (currentValue > limit) {
  // Limit exceeded
}
```

### ❌ Incorrect: Number Comparison

```typescript
// DON'T DO THIS - loses precision for large values
const limit = Number(getLimit(planTier, 'maxExportRows')); // ❌
const currentValue = requestedRows; // ❌

if (currentValue > limit) { // ❌ May fail for large values
  // ...
}
```

## Functions That Handle BigInt

### `getLimit()`

Returns `number | bigint`:
- For `maxExportRows`: returns `bigint`
- For other limits: returns `number`

```typescript
const exportLimit = getLimit(planTier, 'maxExportRows'); // bigint
const webhookLimit = getLimit(planTier, 'maxWebhooks'); // number
```

### `requireLimit()` and `requireCompanyLimit()`

Accept `number | bigint` for `currentValue` and handle both:

```typescript
// For maxExportRows - uses BigInt comparison
requireLimit(planTier, 'maxExportRows', BigInt(requestedRows), requiredPlan);

// For other limits - uses number comparison
requireLimit(planTier, 'maxWebhooks', currentCount, requiredPlan);
```

### `getPlanConfig()`

Automatically converts `maxExportRows` from JSON (planOverrides) to BigInt:

```typescript
// Handles JSON number/string from planOverrides
const config = getPlanConfig(planTier, {
  maxExportRows: 5000000 // JSON number
});
// config.maxExportRows is now BigInt(5000000)
```

## Best Practices

### 1. Always Use BigInt for maxExportRows

```typescript
// ✅ Correct
const limit = getLimit(planTier, 'maxExportRows'); // bigint
const requested = BigInt(requestedRows);
if (requested > limit) { /* ... */ }

// ❌ Incorrect
const limit = Number(getLimit(planTier, 'maxExportRows')); // May lose precision
```

### 2. Convert User Input to BigInt

```typescript
// When receiving export request
const requestedRows = BigInt(req.body.rowCount); // Convert to BigInt
requireLimit(planTier, 'maxExportRows', requestedRows);
```

### 3. Use BigInt Arithmetic

```typescript
// ✅ Correct
const total = BigInt(1000000) + BigInt(500000); // BigInt(1500000)

// ❌ Incorrect (if values are large)
const total = 1000000 + 500000; // May lose precision
```

### 4. String Conversion for Display

```typescript
// Convert BigInt to string for JSON/display
const limitStr = limit.toString(); // "999999999999"
const limitNum = Number(limit); // Only if you're sure it's < MAX_SAFE_INTEGER
```

## Common Pitfalls

### ❌ Pitfall 1: JSON Serialization

BigInt doesn't serialize to JSON by default:

```typescript
// ❌ This will fail
JSON.stringify({ maxExportRows: BigInt(1000) }); // Error!

// ✅ Convert to string first
JSON.stringify({ maxExportRows: BigInt(1000).toString() });
```

### ❌ Pitfall 2: Number Comparison

```typescript
// ❌ May fail for large values
if (requestedRows > Number(limit)) { /* ... */ }

// ✅ Use BigInt comparison
if (BigInt(requestedRows) > limit) { /* ... */ }
```

### ❌ Pitfall 3: Type Coercion

```typescript
// ❌ Don't rely on automatic coercion
const result = requestedRows > limit; // May not work correctly

// ✅ Explicit BigInt conversion
const result = BigInt(requestedRows) > limit;
```

## Example: Export Limit Check

```typescript
// In export endpoint
export async function checkExportLimit(
  company: Company,
  requestedRows: number
): Promise<void> {
  // Get limit (returns bigint for maxExportRows)
  const limit = getCompanyLimit(company, 'maxExportRows');
  
  // Convert requested to BigInt
  const requested = BigInt(requestedRows);
  
  // Compare using BigInt
  if (requested > limit) {
    throw new PlanRestrictionError(
      company.planTier,
      `Export limit exceeded (${requested}/${limit})`
    );
  }
}
```

## Summary

- ✅ `maxExportRows` is `bigint` in TypeScript, `BigInt` in database
- ✅ Always use `BigInt()` for conversions and comparisons
- ✅ Never cast to `Number` if value can exceed `MAX_SAFE_INTEGER`
- ✅ Use `BigInt` arithmetic consistently
- ✅ Convert to string for JSON serialization
- ✅ Enterprise plan uses `BigInt('999999999999')` - safe as BigInt

