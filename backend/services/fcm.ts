import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import * as fs from "fs";
import * as path from "path";

const serviceAccountPath = path.join(
  process.cwd(),
  "config",
  "firebase-service-account.json"
);

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

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
  console.log("[FCM] Token :", token);

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
    const response = await getMessaging().send(message);

    console.log("[FCM] Succès :", response);

    return response;
  } catch (error) {
    if (isInvalidFcmTokenError(error)) {
      console.error("[FCM] Invalid token detected:", { token, error });
      throw new InvalidFcmTokenError(token, error);
    }

    console.error("[FCM] Erreur :", error);
    throw error;
  }
}