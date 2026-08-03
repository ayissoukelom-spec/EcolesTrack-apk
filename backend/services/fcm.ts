import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "../utils/logger";

const logger = new Logger("FCMService");

const serviceAccount = process.env.FCM_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON)
  : JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "config", "firebase-service-account.json"),
        "utf8"
      )
    );

console.log("[FCM TEST] project:", serviceAccount.project_id);
console.log("[FCM TEST] email:", serviceAccount.client_email);
console.log("[FCM TEST KEY]", !!serviceAccount.private_key);

initializeApp({
  credential: cert(serviceAccount),
});

export class InvalidFcmTokenError extends Error {
  public token: string;
  public originalError: unknown;

  constructor(token: string, originalError: unknown) {
    super(`Invalid FCM registration token: ${token}`);
    this.token = token;
    this.originalError = originalError;
    Object.setPrototypeOf(this, InvalidFcmTokenError.prototype);
  }
}

export function isInvalidFcmTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const rawCode = (error as any).code ?? (error as any)?.errorInfo?.code ?? "";
  const code = typeof rawCode === "string" ? rawCode.toLowerCase() : "";
  const message = String((error as any).message ?? "").toLowerCase();

  const invalidCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "registration-token-not-registered",
    "invalid-registration-token",
    "notregistered",
    "unregistered",
  ]);

  if (invalidCodes.has(code)) {
    return true;
  }

  if (message.includes("invalid-registration-token")) {
    return true;
  }

  if (message.includes("registration-token-not-registered")) {
    return true;
  }

  if (message.includes("registration token") && message.includes("not registered")) {
    return true;
  }

  if (message.includes("notregistered")) {
    return true;
  }

  return false;
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  target: string = "home"
) {
  const maskedToken = token ? `${token.slice(0, 10)}...` : "<missing>";
  logger.info("[NOTIF_TRACE] sendPushNotification start", { token: maskedToken, title, body, target });

  const message = {
    token,
    notification: {
      title,
      body,
    },
    data: {
      title,
      body,
      target,
    },
    android: {
      priority: "high" as const,
      notification: {
        channelId: "ecoletrack_notifications",
        defaultSound: true,
        defaultVibrateTimings: true,
        visibility: "public" as const,
      },
    },
  } as const;

  try {
    logger.info("[NOTIF_TRACE] sendPushNotification payload", { token: maskedToken, title, body, target });
    const response = await getMessaging().send(message);

    logger.info("[NOTIF_TRACE] sendPushNotification response", { messageId: response });
    logger.info("[FCM] Succès", { messageId: response });

    return response;
  } catch (error) {
    logger.error("[NOTIF_TRACE] sendPushNotification error", error, {
      code: (error as any)?.code,
      message: (error as any)?.message,
      errorInfo: (error as any)?.errorInfo,
      token: maskedToken
    });
    if (isInvalidFcmTokenError(error)) {
      logger.error("[FCM] Invalid token detected", error, { token: maskedToken });
      throw new InvalidFcmTokenError(token, error);
    }

    logger.error("[FCM] Erreur", error, { token: maskedToken });
    throw error;
  }
}