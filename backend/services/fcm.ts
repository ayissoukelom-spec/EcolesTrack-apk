import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";
import path from "path";

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

export async function sendPushNotification(
  token: string,
  title: string,
  body: string
) {
  console.log("[FCM TEST] Envoi vers token :", token);

  const message = {
    token,
    notification: {
      title,
      body,
    },
  };

  const response = await getMessaging().send(message);

  console.log("[FCM] Message envoyé :", response);

  return response;
}