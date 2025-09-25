import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createHash, timingSafeEqual } from "crypto";

interface WebhookSecrets {
  [header: string]: string;
}

interface CachedSecrets {
  secrets: WebhookSecrets;
  expiresAt: number;
}

const sns = new SNSClient({});
const secretsManager = new SecretsManagerClient({});
const TOPIC_ARN = process.env.TOPIC_ARN!;
const WEBHOOK_SECRET_ID = process.env.WEBHOOK_SECRET_ID!;

// Cache the secrets for 5 minutes to avoid repeated Secrets Manager calls
let cachedSecrets: CachedSecrets | null = null;

async function getWebhookSecrets(): Promise<WebhookSecrets> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached secrets if still valid (5-minute TTL)
  if (cachedSecrets && cachedSecrets.expiresAt > now) {
    return cachedSecrets.secrets;
  }

  if (!WEBHOOK_SECRET_ID) {
    throw new Error("WEBHOOK_SECRET_ID not configured");
  }

  try {
    const response = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: WEBHOOK_SECRET_ID })
    );

    if (!response.SecretString) {
      throw new Error("Empty secret string from Secrets Manager");
    }

    const secrets = JSON.parse(response.SecretString) as WebhookSecrets;
    if (!secrets || Object.keys(secrets).length === 0) {
      throw new Error("No webhook secrets found in secret store");
    }

    // Cache the secrets for 5 minutes
    cachedSecrets = {
      secrets,
      expiresAt: now + 300, // 5 minutes
    };

    return secrets;
  } catch (error) {
    // Clear cache on error to force refresh next time
    cachedSecrets = null;
    console.error("Failed to load webhook secrets from Secrets Manager", {
      error: error instanceof Error ? error.message : String(error),
      secretId: WEBHOOK_SECRET_ID,
    });
    throw error;
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const headers = Object.fromEntries(
      Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v ?? ""]),
    );

    const webhookSecrets = await getWebhookSecrets();

    // Check if any of the configured headers match with valid tokens
    if (!isValidRequest(headers, webhookSecrets)) {
      return { statusCode: 401, body: "unauthorized" };
    }

    const body = typeof event.body === "string" ? event.body : JSON.stringify(event.body ?? {});

    await sns.send(
      new PublishCommand({
        TopicArn: TOPIC_ARN,
        Message: body,
        MessageAttributes: {
          source: { DataType: "String", StringValue: "grafana" },
        },
      }),
    );

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "error" };
  }
};

function digest(input: string): Buffer {
  return createHash("sha256").update(input, "utf8").digest();
}

// Check if request has valid authentication using any configured header/token pair
function isValidRequest(headers: Record<string, string>, webhookSecrets: WebhookSecrets): boolean {
  for (const [headerName, expectedToken] of Object.entries(webhookSecrets)) {
    const providedToken = headers[headerName.toLowerCase()];
    if (providedToken && isValidToken(providedToken, expectedToken)) {
      return true;
    }
  }
  return false;
}

// Timing-safe token comparison to prevent timing attacks
function isValidToken(providedToken: string, expectedToken: string): boolean {
  if (!providedToken) return false;

  const providedDigest = digest(providedToken ?? "");
  const expectedDigest = digest(expectedToken);

  // Both are always 32 bytes, so timingSafeEqual never throws
  return timingSafeEqual(providedDigest, expectedDigest);
}

export default handler;

