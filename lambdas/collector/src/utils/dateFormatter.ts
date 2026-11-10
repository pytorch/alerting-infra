/**
 * Utility functions for formatting dates and times
 */

// Every part comes from one formatter in Pacific time, so the date, the time
// and PST/PDT always agree, whatever time zone the Lambda runs in.
const PACIFIC_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

/**
 * Convert UTC ISO8601 timestamp to Pacific time (PST or PDT) and format in human-readable way
 * @param utcTimestamp ISO8601 UTC timestamp (e.g., "2025-09-03T19:10:01.000Z")
 * @returns Human-readable Pacific timestamp (e.g., "Sep 3, 12:10pm PDT")
 */
export function formatTimestampToPST(utcTimestamp: string): string {
  try {
    const date = new Date(utcTimestamp);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid timestamp format: ${utcTimestamp}`);
      return utcTimestamp; // Return original if parsing fails
    }

    const parts: Record<string, string> = {};
    for (const part of PACIFIC_FORMAT.formatToParts(date)) {
      parts[part.type] = part.value;
    }

    return `${parts.month} ${parts.day}, ${parts.hour}:${parts.minute}${parts.dayPeriod.toLowerCase()} ${parts.timeZoneName}`;
  } catch (error) {
    console.warn(`Error formatting timestamp ${utcTimestamp}:`, error);
    return utcTimestamp; // Return original if any error occurs
  }
}
