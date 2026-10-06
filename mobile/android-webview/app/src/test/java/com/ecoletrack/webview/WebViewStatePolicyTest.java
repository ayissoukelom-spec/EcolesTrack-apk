package com.ecoletrack.webview;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WebViewStatePolicyTest {
    @Test
    public void restoresOnlyStateFromTheTrustedLocalAppOrigin() {
        assertTrue(WebViewStatePolicy.canRestore("https://appassets.androidplatform.net/index.html"));
        assertTrue(WebViewStatePolicy.canRestore("https://appassets.androidplatform.net/error.html"));
        assertTrue(WebViewStatePolicy.canRestore(
                "https://appassets.androidplatform.net/index.html",
                "https://appassets.androidplatform.net/index.html"
        ));
        assertFalse(WebViewStatePolicy.canRestore(
                "https://appassets.androidplatform.net/index.html",
                "https://appassets.androidplatform.net/error.html"
        ));
        assertFalse(WebViewStatePolicy.canRestore("https://example.test/"));
        assertFalse(WebViewStatePolicy.canRestore("file:///android_asset/index.html"));
        assertFalse(WebViewStatePolicy.canRestore(null));
    }
}
