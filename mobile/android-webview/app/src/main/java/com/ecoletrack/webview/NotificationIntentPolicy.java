package com.ecoletrack.webview;

import java.util.UUID;

final class NotificationIntentPolicy {
    private NotificationIntentPolicy() {}

    static String resolveTarget(String target, String title) {
        if (target != null
                && "home".equalsIgnoreCase(target.trim())
                && title != null
                && "Paiement enregistré".equalsIgnoreCase(title.trim())) {
            return "payment";
        }
        return target;
    }

    static String createKey(String notificationId, String paymentId, String messageId) {
        if (paymentId != null && !paymentId.trim().isEmpty()) {
            return "payment-" + paymentId.trim();
        }
        if (notificationId != null && !notificationId.trim().isEmpty()) {
            return "notification-" + notificationId.trim();
        }
        if (messageId != null && !messageId.trim().isEmpty()) {
            return "message-" + messageId.trim();
        }
        return UUID.randomUUID().toString();
    }
}
