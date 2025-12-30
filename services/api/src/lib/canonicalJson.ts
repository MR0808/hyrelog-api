/**
 * Canonical JSON - Stable stringification for hashing
 * 
 * Ensures consistent JSON representation for hash calculations
 * by sorting keys recursively.
 */

/**
 * Canonical JSON - Stable stringification for hashing
 * 
 * Ensures consistent JSON representation for hash calculations
 * by sorting keys recursively.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => {
      const canonical = canonicalJson(item);
      return JSON.parse(canonical);
    });
    return JSON.stringify(items);
  }

  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key];
      const canonical = canonicalJson(value);
      sorted[key] = JSON.parse(canonical);
    }

    return JSON.stringify(sorted);
  }

  return JSON.stringify(obj);
}

