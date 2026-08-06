package com.ecoletrack.webview;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
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
        Log.d(TAG, "[FCM_DEBUG] from=" + remoteMessage.getFrom());
        Log.d(TAG, "[FCM_DEBUG] messageId=" + remoteMessage.getMessageId());
        Log.d(TAG, "[FCM_DEBUG] data=" + remoteMessage.getData());

        String notificationTitle = null;
        String notificationBody = null;
        if (remoteMessage.getNotification() != null) {
            notificationTitle = remoteMessage.getNotification().getTitle();
            notificationBody = remoteMessage.getNotification().getBody();
            Log.d(TAG, "[FCM_DEBUG] notificationTitle=" + notificationTitle);
            Log.d(TAG, "[FCM_DEBUG] notificationBody=" + notificationBody);
        } else {
            Log.d(TAG, "[FCM_DEBUG] notification=none");
        }

        String title = "EcoleTrack";
        String message = "Vous avez une nouvelle notification";
        String target = null;

        if (notificationTitle != null && !notificationTitle.isEmpty()) {
            title = notificationTitle;
        }
        if (notificationBody != null && !notificationBody.isEmpty()) {
            message = notificationBody;
        }

        if (remoteMessage.getData() != null && !remoteMessage.getData().isEmpty()) {
            Log.d(TAG, "[FCM_DEBUG] data map contents=" + remoteMessage.getData());
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
                Log.d(TAG, "[FCM_DEBUG] received target from payload: " + target);
            }
        }

        Log.i(TAG, "final notification title=" + title + " body=" + message + " target=" + target);
        showNotification(title, message, target);
    }

    private void showNotification(String title, String message, String target) {
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
            Log.d(TAG, "[FCM_DEBUG] attaching target to notification intent: " + target);
        }

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
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setDefaults(NotificationCompat.DEFAULT_ALL)
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent);

        Log.i(TAG, "showNotification title=" + title + " message=" + message);
        manager.notify(1001, builder.build());
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

         Log.i(TAG, "MyFirebaseMessagingService.onNewToken token=" + token);
         FcmTokenHelper.savePendingToken(this, token);
         FcmTokenHelper.broadcastToken(this, token);
    }
}
