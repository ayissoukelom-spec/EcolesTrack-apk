import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const serviceAccountPath = path.join(
  process.cwd(),
  "config",
  "firebase-service-account.json"
);

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

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

  const response = await admin.messaging().send(message);

  console.log("[FCM] Message envoyé :", response);

  return response;
}