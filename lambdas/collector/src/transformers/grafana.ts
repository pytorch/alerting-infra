import { BaseTransformer } from "./base";
import { AlertEvent, Envelope, AlertIdentity, AlertLinks } from "../types";

export class GrafanaTransformer extends BaseTransformer {
  transform(rawPayload: any, envelope: Envelope): AlertEvent {
    // Extract debugging context early for better error messages
    const debugContext = this.extractDebugContext(rawPayload, envelope);

    // Validate basic structure
    if (!rawPayload || typeof rawPayload !== "object") {
      throw new Error(`Invalid Grafana payload: not an object. This indicates corrupted data from Grafana. ${debugContext}`);
    }

    // Extract first alert from alerts array, or use top-level fields
    const alert = rawPayload.alerts?.[0] || rawPayload;
    const labels = alert.labels || rawPayload.commonLabels || {};
    const annotations = alert.annotations || rawPayload.commonAnnotations || {};

    // Extract core fields
    const title = this.extractTitle(rawPayload, alert, labels);
    const state = this.extractState(rawPayload, alert);

    // Priority and team are required and expected in annotations based on reference data
    const priorityValue = annotations.Priority ||
      annotations.priority ||
      labels.priority ||
      rawPayload.priority;

    const teamValue = annotations.Team ||
      annotations.TEAM ||
      annotations.team ||
      labels.team ||
      rawPayload.team;

    if (!priorityValue) {
      throw new Error(`Missing required field "Priority" in Grafana alert annotations. Please add this to make the alert work. ${debugContext}`);
    }
    if (!teamValue) {
      throw new Error(`Missing required field "Team" in Grafana alert annotations. Please add this to make the alert work. ${debugContext}`);
    }

    const priority = this.extractPriority(priorityValue);
    const team = this.extractTeam(teamValue);
    const occurredAt = this.extractOccurredAt(alert, rawPayload);


    // Build identity information
    const identity: AlertIdentity = {
      org_id: this.safeString(rawPayload.orgId),
      rule_id: this.safeString(alert.fingerprint || rawPayload.rule_id),
    };

    // Build links with URL validation
    const links: AlertLinks = {
      runbook_url: this.validateUrl(annotations.runbook_url || labels.runbook_url || ""),
      dashboard_url: this.validateUrl(alert.dashboardURL || alert.panelURL || ""),
      source_url: this.validateUrl(alert.generatorURL || rawPayload.generatorURL || ""),
      silence_url: this.validateUrl(alert.silenceURL || ""),
    };

    return {
      schema_version: 1,
      source: "grafana",
      state,
      title,
      description: this.sanitizeString(annotations.description || "", 1500),
      summary: this.sanitizeString(annotations.summary || "", 1500),
      reason: this.sanitizeString(alert.valueString || "", 500),
      priority,
      occurred_at: occurredAt,
      team,
      identity,
      links,
      raw_provider: rawPayload,
    };
  }

  private extractTitle(rawPayload: any, alert: any, labels: any): string {
    // Prioritize rulename (actual alert title) over alertname for better descriptive titles
    const candidates = [
      labels.rulename,          // The actual descriptive alert title
      alert.labels?.rulename,   // Same from alert object
      labels.alertname,         // Fallback to generic alert type
      alert.labels?.alertname,
      rawPayload.groupLabels?.alertname,
      rawPayload.title,         // Last resort: formatted title
    ];

    for (const candidate of candidates) {
      if (candidate && typeof candidate === "string") {
        return this.normalizeTitle(candidate);
      }
    }

    const debugEnvelope = {
      received_at: new Date().toISOString(),
      event_id: '',
      ingest_topic: '',
      ingest_region: '',
      delivery_attempt: 1
    };
    throw new Error(`Missing required field "rulename" or "alertname" in Grafana alert labels. This indicates corrupted data from Grafana. ${this.extractDebugContext(rawPayload, debugEnvelope)}`);
  }

  private extractState(rawPayload: any, alert: any): "FIRING" | "RESOLVED" {
    const status = alert.status || rawPayload.status || rawPayload.state;

    if (typeof status === "string") {
      const normalized = status.toLowerCase();
      if (normalized === "firing" || normalized === "alerting") return "FIRING";
      if (normalized === "resolved" || normalized === "ok") return "RESOLVED";
    }

    const debugEnvelope = {
      received_at: new Date().toISOString(),
      event_id: '',
      ingest_topic: '',
      ingest_region: '',
      delivery_attempt: 1
    };
    throw new Error(`Unable to determine alert state. Received status: '${String(status)}'. Expected 'firing' or 'resolved'. This indicates corrupted data from Grafana. ${this.extractDebugContext(rawPayload, debugEnvelope)}`);
  }

  private extractOccurredAt(alert: any, rawPayload: any): string {
    const candidates = [
      alert.startsAt,
      alert.endsAt,
      rawPayload.startsAt,
      rawPayload.endsAt,
    ];

    for (const candidate of candidates) {
      if (candidate && candidate !== "0001-01-01T00:00:00Z") {
        return this.parseTimestamp(candidate);
      }
    }

    return new Date().toISOString();
  }


  // Extract debugging context for error messages
  private extractDebugContext(rawPayload: any, envelope: Envelope): string {
    const context: string[] = [];

    // Always include source
    context.push("source=grafana");

    // Include messageId for log tracing
    if (envelope.event_id) {
      context.push(`messageId=${envelope.event_id}`);
    }

    // Extract alert title from various locations, prioritizing rulename
    const alertTitle = rawPayload?.alerts?.[0]?.labels?.rulename ||
                      rawPayload?.alerts?.[0]?.labels?.alertname ||
                      rawPayload?.groupLabels?.alertname ||
                      rawPayload?.commonLabels?.alertname ||
                      "unknown";
    context.push(`alertTitle="${alertTitle}"`);

    // Include orgId if available
    if (rawPayload?.orgId) {
      context.push(`orgId=${rawPayload.orgId}`);
    }

    // Include team if available
    const team = rawPayload?.alerts?.[0]?.annotations?.Team ||
                rawPayload?.alerts?.[0]?.annotations?.TEAM ||
                rawPayload?.alerts?.[0]?.annotations?.team ||
                rawPayload?.alerts?.[0]?.labels?.team ||
                rawPayload?.commonAnnotations?.Team ||
                rawPayload?.commonAnnotations?.TEAM ||
                rawPayload?.commonLabels?.team;
    if (team) {
      context.push(`team="${team}"`);
    }

    // Include generator URL for direct debugging link
    const generatorURL = rawPayload?.alerts?.[0]?.generatorURL || rawPayload?.generatorURL;
    if (generatorURL) {
      context.push(`generatorURL="${generatorURL}"`);
    }

    return `[${context.join(", ")}]`;
  }
}