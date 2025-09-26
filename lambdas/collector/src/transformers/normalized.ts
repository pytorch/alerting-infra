import { AlertEvent, Envelope } from "../types";
import { BaseTransformer } from "./base";
import { validateNormalizedAlertEvent } from "../utils/schema-validator";

/**
 * NormalizedTransformer handles pre-normalized AlertEvent messages.
 * This allows custom webhook emitters to send alerts directly in the canonical format,
 * bypassing transformation for improved performance and reliability.
 *
 * Validation is performed using JSON Schema for compliance with the published API contract.
 */
export class NormalizedTransformer extends BaseTransformer {
  /**
   * Transform a pre-normalized alert message
   * @param rawPayload - Pre-normalized AlertEvent object
   * @param envelope - SQS envelope metadata
   * @returns AlertEvent - The alert event (with comprehensive validation)
   */
  transform(rawPayload: any, envelope: Envelope): AlertEvent {
    try {
      // Validate against JSON Schema - this throws if invalid
      validateNormalizedAlertEvent(rawPayload);

      // At this point, TypeScript knows rawPayload is AlertEvent
      const alertEvent = rawPayload;

      // Apply additional security validation using BaseTransformer methods
      this.validateAlertEventUrls(alertEvent);

      // Log successful processing
      console.log("Processed normalized alert", {
        source: alertEvent.source,
        title: alertEvent.title,
        teams: alertEvent.teams,
        priority: alertEvent.priority,
        state: alertEvent.state,
        schema_version: alertEvent.schema_version,
        messageId: envelope.event_id,
      });

      return alertEvent;
    } catch (error) {
      // Add context to validation errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Normalized alert validation failed: ${errorMessage}\n\n` +
          `Ensure your alert conforms to the AlertEvent schema. ` +
          `See: https://github.com/pytorch/test-infra-alerting/tree/main/lambdas/collector/schemas`,
      );
    }
  }

  /**
   * Validate and sanitize URLs in AlertEvent using BaseTransformer methods
   * JSON Schema validates format, but we need additional security validation
   */
  private validateAlertEventUrls(alertEvent: AlertEvent): void {
    // Validate and sanitize URLs if present (mutates the object for security)
    if (alertEvent.links.runbook_url) {
      const validatedUrl = this.validateUrl(alertEvent.links.runbook_url);
      if (!validatedUrl) {
        throw new Error(
          `Invalid runbook_url after security validation: ${alertEvent.links.runbook_url}`,
        );
      }
      alertEvent.links.runbook_url = validatedUrl;
    }

    if (alertEvent.links.dashboard_url) {
      const validatedUrl = this.validateUrl(alertEvent.links.dashboard_url);
      if (!validatedUrl) {
        throw new Error(
          `Invalid dashboard_url after security validation: ${alertEvent.links.dashboard_url}`,
        );
      }
      alertEvent.links.dashboard_url = validatedUrl;
    }

    if (alertEvent.links.source_url) {
      const validatedUrl = this.validateUrl(alertEvent.links.source_url);
      if (!validatedUrl) {
        throw new Error(
          `Invalid source_url after security validation: ${alertEvent.links.source_url}`,
        );
      }
      alertEvent.links.source_url = validatedUrl;
    }

    if (alertEvent.links.silence_url) {
      const validatedUrl = this.validateUrl(alertEvent.links.silence_url);
      if (!validatedUrl) {
        throw new Error(
          `Invalid silence_url after security validation: ${alertEvent.links.silence_url}`,
        );
      }
      alertEvent.links.silence_url = validatedUrl;
    }
  }
}
