/**
 * Utility functions for formatting dates and times
 */

/**
 * Convert UTC ISO8601 timestamp to PST and format in human-readable way
 * @param utcTimestamp ISO8601 UTC timestamp (e.g., "2025-09-03T19:10:01.000Z")
 * @returns Human-readable PST timestamp (e.g., "Sep 3, 12:10pm PST")
 */
export function formatTimestampToPST(utcTimestamp: string): string {
  try {
    const date = new Date(utcTimestamp);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn(`Invalid timestamp format: ${utcTimestamp}`);
      return utcTimestamp; // Return original if parsing fails
    }

    // Convert to Pacific timezone
    const pacificDate = new Date(
      date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
    );

    // Format components
    const month = pacificDate.toLocaleDateString("en-US", {
      month: "short",
      timeZone: "America/Los_Angeles",
    });
    const day = pacificDate.toLocaleDateString("en-US", {
      day: "numeric",
      timeZone: "America/Los_Angeles",
    });

    // Format time in 12-hour format with lowercase am/pm
    let hour = parseInt(
      pacificDate
        .toLocaleDateString("en-US", {
          hour: "numeric",
          hour12: true,
          timeZone: "America/Los_Angeles",
        })
        .split(" ")[0],
    );
    const minute = pacificDate.toLocaleDateString("en-US", {
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    });
    const period = pacificDate
      .toLocaleDateString("en-US", {
        hour: "numeric",
        hour12: true,
        timeZone: "America/Los_Angeles",
      })
      .split(" ")[1]
      .toLowerCase();

    // Get actual Pacific time components using proper timezone conversion
    const timeString = date.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const [time, ampm] = timeString.split(" ");
    const [hourStr, minuteStr] = time.split(":");

    // Determine if we're in PST or PDT
    const isDST = isDaylightSavingTime(date);
    const timezone = isDST ? "PDT" : "PST";

    return `${month} ${day}, ${hourStr}:${minuteStr}${ampm.toLowerCase()} ${timezone}`;
  } catch (error) {
    console.warn(`Error formatting timestamp ${utcTimestamp}:`, error);
    return utcTimestamp; // Return original if any error occurs
  }
}

/**
 * Determine if a given date falls within Daylight Saving Time in Pacific timezone
 * DST rules: Starts second Sunday in March, ends first Sunday in November
 * @param date Date to check
 * @returns true if the date is during PDT, false if PST
 */
function isDaylightSavingTime(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (0 = January, 2 = March, 10 = November)
  const day = date.getDate();

  // Before March or after November: definitely PST
  if (month < 2 || month > 10) {
    return false;
  }

  // April through October: definitely PDT
  if (month > 2 && month < 10) {
    return true;
  }

  // March: PDT starts on the second Sunday
  if (month === 2) {
    const secondSunday = getSecondSundayOfMonth(year, 2); // March is month 2
    return day >= secondSunday;
  }

  // November: PDT ends on the first Sunday
  if (month === 10) {
    const firstSunday = getFirstSundayOfMonth(year, 10); // November is month 10
    return day < firstSunday;
  }

  return false;
}

/**
 * Get the date of the second Sunday of a given month and year
 * @param year Full year (e.g., 2025)
 * @param month 0-indexed month (2 for March)
 * @returns Day of the month for the second Sunday
 */
function getSecondSundayOfMonth(year: number, month: number): number {
  // Start with the first day of the month
  let date = new Date(year, month, 1);

  // Find the first Sunday
  while (date.getDay() !== 0) {
    // 0 = Sunday
    date.setDate(date.getDate() + 1);
  }

  // Move to the second Sunday
  date.setDate(date.getDate() + 7);

  return date.getDate();
}

/**
 * Get the date of the first Sunday of a given month and year
 * @param year Full year (e.g., 2025)
 * @param month 0-indexed month (10 for November)
 * @returns Day of the month for the first Sunday
 */
function getFirstSundayOfMonth(year: number, month: number): number {
  // Start with the first day of the month
  let date = new Date(year, month, 1);

  // Find the first Sunday
  while (date.getDay() !== 0) {
    // 0 = Sunday
    date.setDate(date.getDate() + 1);
  }

  return date.getDate();
}
