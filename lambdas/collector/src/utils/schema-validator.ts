import Ajv from "ajv";
import addFormats from "ajv-formats";
import { AlertEvent } from "../types";
import alertEventSchema from "../../schemas/alert-event.schema.json";

// Create AJV instance with format validation
const ajv = new Ajv({
  allErrors: true, // Collect all validation errors, not just the first
  verbose: true, // Include schema and data in errors
  strict: false, // Allow unknown schema properties
  validateSchema: false, // Skip meta-schema validation to avoid the error
});

// Add format validators (date-time, uri, etc.)
addFormats(ajv);

/**
 * Compiled AJV validation function for AlertEvent schema.
 *
 * This is both a function and an object created by `ajv.compile()`:
 *
 * **As a function:**
 * - Call `isValidNormalizedAlertEvent(data)` to validate data
 * - Returns `true` if valid, `false` if invalid
 *
 * **As an object:**
 * - Access `isValidNormalizedAlertEvent.errors` after validation for detailed error information
 * - Contains `null` if last validation passed, or `ErrorObject[]` array if failed
 * - Also has properties like `schema`, `schemaEnv` for introspection
 *
 * Use `validateNormalizedAlertEvent()` wrapper for assertion-style validation with thrown errors.
 *
 * @example
 * ```typescript
 * const isValid = isValidNormalizedAlertEvent(data);
 * if (!isValid) {
 *   const errors = isValidNormalizedAlertEvent.errors || [];
 *   console.log('Validation errors:', errors);
 * }
 * ```
 */
export const isValidNormalizedAlertEvent = ajv.compile(alertEventSchema);

/**
 * Validates that an object conforms to the AlertEvent JSON Schema
 * @param data - Object to validate
 * @returns true if valid
 * @throws Error with detailed validation messages if invalid
 */
export function validateNormalizedAlertEvent(
  data: unknown,
): asserts data is AlertEvent {
  const isValid = isValidNormalizedAlertEvent(data);

  if (!isValid) {
    const errors = isValidNormalizedAlertEvent.errors || [];

    // Create detailed error message
    const errorMessages = errors.map((error) => {
      const path = error.instancePath || "root";
      const message = error.message || "validation failed";
      const allowedValues = error.params?.allowedValues
        ? ` (allowed: ${error.params.allowedValues.join(", ")})`
        : "";
      const receivedValue =
        error.data !== undefined
          ? ` (received: ${JSON.stringify(error.data)})`
          : "";

      return `${path}: ${message}${allowedValues}${receivedValue}`;
    });

    throw new Error(
      `AlertEvent validation failed:\n${errorMessages.join("\n")}\n\n` +
        `Schema: ${alertEventSchema.$id}\n` +
        `For documentation and examples, see: https://github.com/pytorch/test-infra-alerting/tree/main/lambdas/collector/schemas`,
    );
  }
}

/**
 * Gets the JSON Schema for external consumption
 * @returns The AlertEvent JSON Schema object
 */
export function getAlertEventSchema() {
  return alertEventSchema;
}

/**
 * Gets the schema version from the JSON Schema
 * @returns Current schema version
 */
export function getCurrentSchemaVersion(): number {
  // Extract from schema examples or default to 1
  const examples = alertEventSchema.examples as any[];
  return examples?.[0]?.schema_version || 1;
}
