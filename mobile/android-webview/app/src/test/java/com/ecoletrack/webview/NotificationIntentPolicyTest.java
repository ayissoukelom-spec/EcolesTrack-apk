package com.ecoletrack.webview;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import org.junit.Test;

public class NotificationIntentPolicyTest {
    @Test
    public void recognizesLegacyPaymentPushesWithoutChangingOtherFallbackTargets() {
        assertEquals("payment", NotificationIntentPolicy.resolveTarget("home", "Paiement enregistré"));
        assertEquals("home", NotificationIntentPolicy.resolveTarget("home", "Information"));
        assertEquals("notes", NotificationIntentPolicy.resolveTarget("notes", "Paiement enregistré"));
        assertEquals(null, NotificationIntentPolicy.resolveTarget(null, null));
    }

    @Test
    public void usesPaymentIdToKeepPaymentNotificationsDistinct() {
        assertEquals("payment-100", NotificationIntentPolicy.createKey(null, "100", "message-a"));
        assertNotEquals(
                NotificationIntentPolicy.createKey(null, "100", "message-a"),
                NotificationIntentPolicy.createKey(null, "101", "message-b")
        );
    }

    @Test
    public void fallsBackToNotificationOrMessageIdWhenOptionalPaymentDataIsMissing() {
        assertEquals("notification-12", NotificationIntentPolicy.createKey("12", null, "message-a"));
        assertEquals("message-message-b", NotificationIntentPolicy.createKey(null, null, "message-b"));
    }
}
