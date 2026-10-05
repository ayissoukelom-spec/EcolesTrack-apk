package com.ecoletrack.webview;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WhatsAppUrlPolicyTest {
    @Test
    public void delegatesOnlyValidWaMeHttpsLinks() {
        assertTrue(WhatsAppUrlPolicy.shouldOpenExternally("https://wa.me/22890000000?text=Bonjour"));
        assertFalse(WhatsAppUrlPolicy.shouldOpenExternally("http://wa.me/22890000000"));
        assertFalse(WhatsAppUrlPolicy.shouldOpenExternally("https://example.com/22890000000"));
        assertFalse(WhatsAppUrlPolicy.shouldOpenExternally("https://wa.me/not-a-number"));
        assertFalse(WhatsAppUrlPolicy.shouldOpenExternally("https://wa.me.evil.test/22890000000"));
        assertFalse(WhatsAppUrlPolicy.shouldOpenExternally("https://wa.me:443/22890000000"));
    }
}
