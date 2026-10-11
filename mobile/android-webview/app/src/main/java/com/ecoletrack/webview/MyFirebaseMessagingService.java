package com.ecoletrack.webview;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.graphics.BitmapFactory;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import com.ecoletrack.webview.FcmTokenHelper;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "EcoleTrackAndroid";
    private static final String CHANNEL_ID = "ecoletrack_notifications";
        public MyFirebaseMessagingService() {
        Log.i(TAG, "SERVICE CREATED");
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "[FCM_DEBUG] onMessageReceived() called");
        String notificationTitle = null;
        String notificationBody = null;
        if (remoteMessage.getNotification() != null) {
            notificationTitle = remoteMessage.getNotification().getTitle();
            notificationBody = remoteMessage.getNotification().getBody();
        }

        String title = "EcoleTrack";
        String message = "Vous avez une nouvelle notification";
        String target = null;
        String notificationId = null;
        String attachmentCount = null;
        String paymentId = null;

        if (notificationTitle != null && !notificationTitle.isEmpty()) {
            title = notificationTitle;
        }
        if (notificationBody != null && !notificationBody.isEmpty()) {
            message = notificationBody;
        }

        if (remoteMessage.getData() != null && !remoteMessage.getData().isEmpty()) {
            if (remoteMessage.getData().containsKey("title")) {
                title = remoteMessage.getData().get("title");
            }
            if (remoteMessage.getData().containsKey("body")) {
                message = remoteMessage.getData().get("body");
            }
            if (remoteMessage.getData().containsKey("message")) {
                message = remoteMessage.getData().get("message");
            }
            if (remoteMessage.getData().containsKey("target")) {
                target = remoteMessage.getData().get("target");
            }
            if (remoteMessage.getData().containsKey("notificationId")) {
                notificationId = remoteMessage.getData().get("notificationId");
            }
            if (remoteMessage.getData().containsKey("attachmentCount")) {
                attachmentCount = remoteMessage.getData().get("attachmentCount");
            }
            if (remoteMessage.getData().containsKey("paymentId")) {
                paymentId = remoteMessage.getData().get("paymentId");
            }
        }

        target = NotificationIntentPolicy.resolveTarget(target, title);
        Log.i(TAG, "FCM message received; notification content omitted from logs");
        String notificationKey = NotificationIntentPolicy.createKey(
                notificationId,
                paymentId,
                remoteMessage.getMessageId()
        );
        showNotification(title, message, target, notificationId, attachmentCount, notificationKey);
    }

    private void showNotification(
            String title,
            String message,
            String target,
            String notificationId,
            String attachmentCount,
            String notificationKey
    ) {
        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        if (manager == null) {
            Log.e(TAG, "NotificationManager is null, cannot show notification");
            return;
        }

        createNotificationChannel(manager);


        Intent intent = new Intent(this, MainActivity.class);
        if (target != null && !target.trim().isEmpty()) {
            intent.putExtra("target", target);
        }
        if (notificationId != null && !notificationId.trim().isEmpty()) {
            intent.putExtra("notificationId", notificationId);
        }
        if (attachmentCount != null && !attachmentCount.trim().isEmpty()) {
            intent.putExtra("attachmentCount", attachmentCount);
        }
        intent.setData(Uri.parse("ecoletrack://notification/" + Uri.encode(notificationKey)));

        PendingIntent pendingIntent =
                PendingIntent.getActivity(
                        this,
                        0,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );


        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(com.ecoletrack.webview.R.drawable.ic_notification)
                        // .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.drawable.ic_launcher))
                        .setContentTitle(title)
                        .setContentText(message)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                        .setPublicVersion(new NotificationCompat.Builder(this, CHANNEL_ID)
                                .setSmallIcon(com.ecoletrack.webview.R.drawable.ic_notification)
                                .setContentTitle("EcoleTrack")
                                .setContentText("Vous avez une nouvelle notification")
                                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                                .build())
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setDefaults(NotificationCompat.DEFAULT_ALL)
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent);

        Log.i(TAG, "Displaying FCM notification");
        manager.notify(notificationKey, 1001, builder.build());
    }

    private void createNotificationChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Notifications EcoleTrack",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Alertes parents");
            manager.createNotificationChannel(channel);
            Log.i(TAG, "NotificationChannel created: " + CHANNEL_ID);
        }
    }

    @Override
    public void onNewToken(String token) {
         super.onNewToken(token);

         Log.i(TAG, "Firebase registration token updated");
         FcmTokenHelper.savePendingToken(this, token);
         FcmTokenHelper.broadcastToken(this, token);
    }
}
