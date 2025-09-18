import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createHash, timingSafeEqual } from "crypto";

interface WebhookSecret {
  grafana_webhook_token: string;
}

interface CachedSecret {
  token: string;
  expiresAt: number;
}

const sns = new SNSClient({});
const secrets = new SecretsManagerClient({});
const TOPIC_ARN = process.env.TOPIC_ARN!;
const WEBHOOK_SECRET_ID = process.env.WEBHOOK_SECRET_ID!;

// Cache the token for 5 minutes to avoid repeated Secrets Manager calls
let cachedSecret: CachedSecret | null = null;

async function getWebhookToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (5-minute TTL)
  if (cachedSecret && cachedSecret.expiresAt > now) {
    return cachedSecret.token;
  }

  if (!WEBHOOK_SECRET_ID) {
    throw new Error("WEBHOOK_SECRET_ID not configured");
  }

  try {
    const response = await secrets.send(
      new GetSecretValueCommand({ SecretId: WEBHOOK_SECRET_ID })
    );

    if (!response.SecretString) {
      throw new Error("Empty secret string from Secrets Manager");
    }

    const secret = JSON.parse(response.SecretString) as WebhookSecret;
    if (!secret.grafana_webhook_token) {
      throw new Error("Missing grafana_webhook_token in secret");
    }

    // Cache the token for 5 minutes
    cachedSecret = {
      token: secret.grafana_webhook_token,
      expiresAt: now + 300, // 5 minutes
    };

    return secret.grafana_webhook_token;
  } catch (error) {
    // Clear cache on error to force refresh next time
    cachedSecret = null;
    console.error("Failed to load webhook token from Secrets Manager", {
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

    const providedToken = headers["x-grafana-token"] || "";
    const expectedToken = await getWebhookToken();

    // Use timing-safe comparison to prevent timing attacks
    if (!isValidToken(providedToken, expectedToken)) {
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

// Timing-safe token comparison to prevent timing attacks
function isValidToken(providedToken: string, expectedToken: string): boolean {
  if (!providedToken) return false;

  const providedDigest = digest(providedToken ?? "");
  const expectedDigest = digest(expectedToken);

  // Both are always 32 bytes, so timingSafeEqual never throws
  return timingSafeEqual(providedDigest, expectedDigest);
}

export default handler;

