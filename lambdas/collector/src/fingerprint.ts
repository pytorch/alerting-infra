import { createHash } from "crypto";
import { AlertEvent } from "./types";

// Generate stable fingerprint for alert deduplication
export function generateFingerprint(alertEvent: AlertEvent): string {
  const fingerprintInputs: Record<string, any> = {
    source: alertEvent.source,
    title: normalizeTitle(alertEvent.title),
  };

  // Add identity fields
  if (alertEvent.identity.account_id) {
    fingerprintInputs.account_id = alertEvent.identity.account_id;
  }
  if (alertEvent.identity.region) {
    fingerprintInputs.region = alertEvent.identity.region;
  }
  if (alertEvent.identity.alarm_id) {
    fingerprintInputs.alarm_id = alertEvent.identity.alarm_id;
  }

  return sortAndHashObject(fingerprintInputs);
}

// Helper function to create deterministic hash from object
function sortAndHashObject(obj: Record<string, any>): string {
  // Sort keys to ensure deterministic ordering
  const sortedKeys = Object.keys(obj).sort();
  const sortedPairs = sortedKeys.map((key) => `${key}=${obj[key]}`);
  const canonicalString = sortedPairs.join("|");

  // Create SHA-256 hash
  return createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

// Normalize title for consistent fingerprinting
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}
