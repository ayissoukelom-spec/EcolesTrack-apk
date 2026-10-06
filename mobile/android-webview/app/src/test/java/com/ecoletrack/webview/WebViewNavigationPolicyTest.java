package com.ecoletrack.webview;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import org.junit.Test;

public class WebViewNavigationPolicyTest {
    @Test
    public void allowsOnlyThePackagedAppOriginInTheWebView() {
        assertEquals(
                WebViewNavigationPolicy.Decision.ALLOW_IN_WEBVIEW,
                WebViewNavigationPolicy.decide("https://appassets.androidplatform.net/index.html", true)
        );
        assertEquals(
                WebViewNavigationPolicy.Decision.ALLOW_IN_WEBVIEW,
                WebViewNavigationPolicy.decide("https://appassets.androidplatform.net/assets/app.js", false)
        );
        assertFalse(WebViewNavigationPolicy.isTrustedAppUrl("http://appassets.androidplatform.net/index.html"));
        assertFalse(WebViewNavigationPolicy.isTrustedAppUrl("https://appassets.androidplatform.net.evil.test/index.html"));
        assertFalse(WebViewNavigationPolicy.isTrustedAppUrl("https://appassets.androidplatform.net@evil.test/index.html"));
        assertFalse(WebViewNavigationPolicy.isTrustedAppUrl("https://appassets.androidplatform.net:444/index.html"));
        assertFalse(WebViewNavigationPolicy.isTrustedAppUrl("file:///android_asset/index.html"));
    }

    @Test
    public void opensOnlyApprovedWhatsAppLinksOutsideTheWebView() {
        assertEquals(
                WebViewNavigationPolicy.Decision.OPEN_WHATSAPP_EXTERNALLY,
                WebViewNavigationPolicy.decide("https://wa.me/22890000000?text=Bonjour", true)
        );
        assertEquals(
                WebViewNavigationPolicy.Decision.BLOCK,
                WebViewNavigationPolicy.decide("https://wa.me/22890000000", false)
        );
        assertEquals(
                WebViewNavigationPolicy.Decision.BLOCK,
                WebViewNavigationPolicy.decide("https://example.com/", true)
        );
        assertEquals(
                WebViewNavigationPolicy.Decision.BLOCK,
                WebViewNavigationPolicy.decide("javascript:alert(1)", true)
        );
        assertEquals(WebViewNavigationPolicy.Decision.BLOCK, WebViewNavigationPolicy.decide(null, true));
    }
}
