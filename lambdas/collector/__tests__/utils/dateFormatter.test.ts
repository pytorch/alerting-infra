import { describe, it, expect } from "vitest";
import { formatTimestampToPST } from "../../src/utils/dateFormatter";

describe("dateFormatter", () => {
  describe("formatTimestampToPST", () => {
    it("should format UTC timestamp to PST during standard time (winter)", () => {
      // January date - should be PST
      const utcTimestamp = "2025-01-15T19:10:01.000Z";
      const result = formatTimestampToPST(utcTimestamp);

      // Should contain PST and be formatted as "Jan 15, H:MMam/pm PST"
      expect(result).toMatch(/Jan 15, \d{1,2}:\d{2}[ap]m PST/);
      expect(result).toContain("PST");
    });

    it("should format UTC timestamp to PDT during daylight time (summer)", () => {
      // July date - should be PDT
      const utcTimestamp = "2025-07-15T19:10:01.000Z";
      const result = formatTimestampToPST(utcTimestamp);

      // Should contain PDT and be formatted as "Jul 15, H:MMam/pm PDT"
      expect(result).toMatch(/Jul 15, \d{1,2}:\d{2}[ap]m PDT/);
      expect(result).toContain("PDT");
    });

    it("should handle the test data timestamp format correctly", () => {
      // Using the timestamp from our test data
      const utcTimestamp = "2025-09-03T19:10:01.000Z";
      const result = formatTimestampToPST(utcTimestamp);

      // September should be PDT and formatted as "Sep 3, H:MMam/pm PDT"
      expect(result).toMatch(/Sep 3, \d{1,2}:\d{2}[ap]m PDT/);
      expect(result).toContain("PDT");
    });

    it("should convert UTC time correctly to Pacific time", () => {
      // 7 PM UTC should be 11 AM PST in January (UTC-8)
      const utcTimestamp = "2025-01-15T19:10:01.000Z"; // Winter - PST
      const result = formatTimestampToPST(utcTimestamp);

      // 19:10 UTC = 11:10 AM PST in January
      expect(result).toContain("11:10am PST");
    });

    it("should handle invalid timestamp gracefully", () => {
      const invalidTimestamp = "not-a-valid-timestamp";
      const result = formatTimestampToPST(invalidTimestamp);

      // Should return the original string when parsing fails
      expect(result).toBe(invalidTimestamp);
    });

    it("should handle empty string gracefully", () => {
      const result = formatTimestampToPST("");

      // Should return the original empty string
      expect(result).toBe("");
    });

    it("should handle timestamps without milliseconds", () => {
      const utcTimestamp = "2025-09-03T19:10:01Z";
      const result = formatTimestampToPST(utcTimestamp);

      expect(result).toMatch(/Sep 3, \d{1,2}:\d{2}[ap]m PDT/);
    });

    it("should format time in 12-hour format with lowercase am/pm", () => {
      // Morning time - 16:30 UTC should be ~9:30 AM PDT in September
      const morningTimestamp = "2025-09-03T16:30:15.000Z";
      const morningResult = formatTimestampToPST(morningTimestamp);
      expect(morningResult).toContain("am");

      // Evening time - 02:30 UTC should be ~7:30 PM PDT (previous day) in September
      const eveningTimestamp = "2025-09-03T02:30:15.000Z";
      const eveningResult = formatTimestampToPST(eveningTimestamp);
      expect(eveningResult).toContain("pm");
    });

    it("should produce the exact desired format", () => {
      // Test the exact format requested: "Sep 3, 12:10pm PST"
      const utcTimestamp = "2025-09-03T19:10:01.000Z"; // Should be 12:10pm PDT in September
      const result = formatTimestampToPST(utcTimestamp);

      // Should match the exact format pattern
      expect(result).toMatch(
        /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}[ap]m P[DS]T$/,
      );
    });

    it("should correctly handle DST transitions", () => {
      // Test dates around DST transitions in 2025
      // DST starts on March 9, 2025 (second Sunday in March)
      const beforeDST = "2025-03-08T20:00:00.000Z"; // March 8, should be PST
      const afterDST = "2025-03-10T19:00:00.000Z"; // March 10, should be PDT

      const beforeResult = formatTimestampToPST(beforeDST);
      const afterResult = formatTimestampToPST(afterDST);

      expect(beforeResult).toContain("PST");
      expect(afterResult).toContain("PDT");

      // DST ends on November 2, 2025 (first Sunday in November)
      const duringDST = "2025-11-01T19:00:00.000Z"; // November 1, should be PDT
      const afterDSTEnds = "2025-11-03T20:00:00.000Z"; // November 3, should be PST

      const duringResult = formatTimestampToPST(duringDST);
      const afterEndResult = formatTimestampToPST(afterDSTEnds);

      expect(duringResult).toContain("PDT");
      expect(afterEndResult).toContain("PST");
    });
  });
});
