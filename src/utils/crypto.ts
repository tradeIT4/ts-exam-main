import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

export function generateApiKey(prefix = "ts_live_"): string {
  const bytes = randomBytes(24).toString("hex");
  return `${prefix}${bytes}`;
}

export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
