import type { SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AlertProcessor } from "./processor";
import { generateFingerprint } from "./fingerprint";
import { AlertStateManager } from "./database";
import { GitHubClient } from "./github/githubClient";

const tableName = process.env.STATUS_TABLE_NAME;
const githubRepo = process.env.GITHUB_REPO || ""; // format: org/repo
const githubAppSecretId = process.env.GITHUB_APP_SECRET_ID || "";
const enableGithubIssues = process.env.ENABLE_GITHUB_ISSUES === "true";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const processor = new AlertProcessor();
const stateManager = tableName
  ? new AlertStateManager(ddbClient, tableName)
  : null;
const githubClient = new GitHubClient(githubRepo, githubAppSecretId, 10);

/**
 * Create a GitHub issue for an alert
 */
async function createGitHubIssueForAlert(
  alertEvent: import("./types").AlertEvent,
  fingerprint: string,
): Promise<{ success: boolean; issueNumber?: number; error?: string }> {
  try {
    const issueTitle = `[${alertEvent.priority}] ${alertEvent.title}`;

    const issueBody = [
      // Add summary at the top if available
      alertEvent.summary ? `**${alertEvent.summary}**\n\n` : "",
      `**Alert Details**\n`,
      `- **Occurred At**: ${alertEvent.occurred_at}\n`,
      `- **State**: ${alertEvent.state}\n`,
      `- **Team**: ${alertEvent.team}\n`,
      `- **Priority**: ${alertEvent.priority}\n`,
      alertEvent.description
        ? `- **Description**: ${alertEvent.description}\n`
        : "",
      alertEvent.reason ? `- **Reason**: ${alertEvent.reason}\n` : "",
      alertEvent.links?.runbook_url
        ? `- **Runbook**: ${alertEvent.links.runbook_url}\n`
        : "",
      alertEvent.links?.dashboard_url
        ? `- **Dashboard**: ${alertEvent.links.dashboard_url}\n`
        : "",
      alertEvent.links?.source_url
        ? `- **View Alert**: ${alertEvent.links.source_url}\n`
        : "",
      alertEvent.links?.silence_url
        ? `- **Silence Alert**: ${alertEvent.links.silence_url}\n`
        : "",
      `- **Source**: ${alertEvent.source}\n`,
      `- **Fingerprint**: \`${fingerprint}\`\n`,
    ]
      .filter(Boolean)
      .join("");

    // Create labels based on priority, team, source, and default area label
    // Note: Team names are already normalized (spaces escaped) by transformers
    const labels = [
      "area:alerting", // Default label for all alerts
      `Pri:${alertEvent.priority}`,
      `Team:${alertEvent.team}`,
      `Source:${alertEvent.source}`,
    ];

    const issueNumber = await githubClient.createGithubIssue(
      issueTitle,
      issueBody,
      labels,
    );
    console.log(
      `✅ Created GitHub issue #${issueNumber} for fingerprint ${fingerprint}`,
    );

    return { success: true, issueNumber };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to create GitHub issue", {
      fingerprint,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Close a GitHub issue for a resolved alert
 */
async function closeGitHubIssueForAlert(
  issueNumber: number,
  fingerprint: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const success = await githubClient.closeGithubIssue(issueNumber);

    if (success) {
      console.log(
        `✅ Closed GitHub issue #${issueNumber} for fingerprint ${fingerprint}`,
      );
      return { success: true };
    } else {
      console.warn(
        `⚠️ GitHub issue #${issueNumber} close fell back to manual processing (circuit breaker)`,
      );
      return { success: false, error: "Circuit breaker fallback" };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to close GitHub issue", {
      fingerprint,
      issueNumber,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Add a comment to a GitHub issue for a recurring alert
 */
async function commentOnGitHubIssueForAlert(
  alertEvent: import("./types").AlertEvent,
  issueNumber: number,
  fingerprint: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const commentBody = [
      `**Alert Update**`,
      `- **State**: ${alertEvent.state}`,
      `- **Occurred At**: ${alertEvent.occurred_at}`,
      alertEvent.reason ? `- **Reason**: ${alertEvent.reason}` : "",
      "",
      "The alert condition is still active.",
      "",
      `**Fingerprint**: \`${fingerprint}\``,
    ]
      .filter(Boolean)
      .join("\n");

    const success = await githubClient.commentOnGithubIssue(
      issueNumber,
      commentBody,
    );

    if (success) {
      console.log(
        `✅ Added comment to GitHub issue #${issueNumber} for fingerprint ${fingerprint}`,
      );
      return { success: true };
    } else {
      console.warn(
        `⚠️ GitHub issue #${issueNumber} comment fell back to manual processing (circuit breaker)`,
      );
      return { success: false, error: "Circuit breaker fallback" };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to comment on GitHub issue", {
      fingerprint,
      issueNumber,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

export const handler: SQSHandler = async (event) => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      // Log incoming record for debugging
      console.log("\n\n");
      console.log("Processing raw record");
      console.log(record);
      console.log("\n\n");
      // continue; // DISABLED: Enable main processing pipeline

      // Process the record through the normalization pipeline
      const result = await processor.processRecord(record);

      if (!result.success) {
        console.error("Alert processing failed", {
          messageId: record.messageId,
          error: result.error,
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      const { fingerprint, action, metadata } = result;
      if (!fingerprint || !action) {
        console.error("No fingerprint or action generated", {
          messageId: record.messageId,
          hasFingerprint: !!fingerprint,
          hasAction: !!action,
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      // Enhanced logging for validation
      console.log("=".repeat(80));
      console.log("🔍 ALERT VALIDATION SUMMARY");
      console.log("=".repeat(80));

      console.log("\n📥 RAW INCOMING PAYLOAD:");
      console.log(JSON.stringify(JSON.parse(record.body), null, 2));

      const alertEvent = result.metadata?.alertEvent;
      if (alertEvent) {
        console.log("\n✨ NORMALIZED ALERT EVENT:");
        console.log(
          JSON.stringify(
            {
              source: alertEvent.source,
              state: alertEvent.state,
              title: alertEvent.title,
              description: alertEvent.description,
              reason: alertEvent.reason,
              priority: alertEvent.priority,
              team: alertEvent.team,
              occurred_at: alertEvent.occurred_at,
              identity: alertEvent.identity,
              links: alertEvent.links,
              schema_version: alertEvent.schema_version,
            },
            null,
            2,
          ),
        );
      }

      console.log(`\n🔗 FINGERPRINT: ${fingerprint}`);
      console.log(`⚡ ACTION DETERMINED: ${action}`);
      console.log(`📝 MESSAGE ID: ${record.messageId}`);

      if (alertEvent) {
        console.log(`\n🎫 GITHUB ACTION PLAN:`);
        console.log(`   Action: ${action}`);
        if (action === "CREATE") {
          const wouldCreateIssue = `[${alertEvent.priority}] ${alertEvent.title}`;
          const wouldCreateLabels = [
            "area:alerting",
            `Pri:${alertEvent.priority}`,
            `Team:${alertEvent.team}`,
            `Source:${alertEvent.source}`,
          ];
          console.log(`   Title: ${wouldCreateIssue}`);
          console.log(`   Labels: ${wouldCreateLabels.join(", ")}`);
        } else if (action === "CLOSE") {
          console.log(`   Will close existing issue for resolved alert`);
        } else if (action === "COMMENT") {
          console.log(
            `   Will add comment to existing issue for continuing alert`,
          );
        } else {
          console.log(`   No GitHub action required`);
        }
        console.log(`   Repo: ${githubRepo}`);
      }

      console.log("=".repeat(80));
      console.log("\n");

      // Initialize GitHub-related variables
      let emittedToGithub = false;
      let issueNumber: number | undefined = undefined;

      // GitHub action handling (optional - controlled by environment variable)
      if (enableGithubIssues && result.metadata?.alertEvent) {
        try {
          if (action === "CREATE") {
            const githubResult = await createGitHubIssueForAlert(
              result.metadata.alertEvent,
              fingerprint,
            );
            emittedToGithub = githubResult.success;
            issueNumber = githubResult.issueNumber;
          } else if (action === "CLOSE") {
            // Load existing state to get issue number
            if (stateManager) {
              const existingState = await stateManager.loadState(fingerprint);
              if (existingState?.issue_number) {
                const githubResult = await closeGitHubIssueForAlert(
                  existingState.issue_number,
                  fingerprint,
                );
                emittedToGithub = githubResult.success;
                issueNumber = existingState.issue_number; // Keep the same issue number
              } else {
                console.warn(
                  `Cannot close GitHub issue: no issue number found for fingerprint ${fingerprint}`,
                );
              }
            }
          } else if (action === "COMMENT") {
            // Load existing state to get issue number
            if (stateManager) {
              const existingState = await stateManager.loadState(fingerprint);
              if (existingState?.issue_number) {
                const githubResult = await commentOnGitHubIssueForAlert(
                  result.metadata.alertEvent,
                  existingState.issue_number,
                  fingerprint,
                );
                emittedToGithub = githubResult.success;
                issueNumber = existingState.issue_number; // Keep the same issue number
              } else {
                console.warn(
                  `Cannot comment on GitHub issue: no issue number found for fingerprint ${fingerprint}`,
                );
              }
            }
          } else {
            console.log(`No GitHub action needed for action: ${action}`);
          }
          // Continue processing regardless of GitHub success/failure
        } catch (githubError) {
          console.error(
            `GitHub ${action} action failed, continuing with DynamoDB save`,
            {
              fingerprint,
              action,
              error:
                githubError instanceof Error
                  ? githubError.message
                  : String(githubError),
            },
          );
          // Continue processing - GitHub failure should not stop DynamoDB save
        }
      } else if (result.metadata?.alertEvent) {
        console.log(
          `📝 GitHub actions disabled (ENABLE_GITHUB_ISSUES=${enableGithubIssues})`,
        );
      }

      // ALWAYS save to DynamoDB regardless of GitHub status
      if (stateManager && result.metadata?.alertEvent) {
        try {
          await stateManager.saveState(
            fingerprint,
            result.metadata.alertEvent,
            action,
            issueNumber, // undefined when GitHub disabled or failed - this is fine
          );
          const githubStatus = emittedToGithub
            ? ` (with GitHub ${action.toLowerCase()} #${issueNumber})`
            : enableGithubIssues
              ? ` (GitHub ${action.toLowerCase()} failed)`
              : " (GitHub disabled)";
          console.log(
            `✅ Stored alert state ${fingerprint} to DynamoDB${githubStatus}`,
          );
        } catch (err) {
          console.error(
            "❌ DynamoDB save failed - this will retry the message",
            {
              error: err instanceof Error ? err.message : String(err),
              table: tableName,
              messageId: record.messageId,
              fingerprint,
              githubEnabled: enableGithubIssues,
              hadIssueNumber: issueNumber !== undefined,
            },
          );
          // DynamoDB failure should fail the record for retry
          batchItemFailures.push({ itemIdentifier: record.messageId });
        }
      } else {
        console.error(
          "❌ Cannot save to DynamoDB - missing stateManager or alertEvent",
          {
            hasStateManager: !!stateManager,
            hasAlertEvent: !!result.metadata?.alertEvent,
            tableName,
            messageId: record.messageId,
          },
        );
        // This is a configuration/processing error - fail the record
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    } catch (err) {
      console.error(`Failed to process record ${record.messageId}:`, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  // Return batch item failures for SQS partial batch failure handling
  return {
    batchItemFailures,
  };
};

export default handler;
