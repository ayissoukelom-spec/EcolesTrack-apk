package com.ecoletrack.webview;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class BackNavigationPolicyTest {
    @Test
    public void doesNotNavigateToBootstrapHistoryBeforeAppPageLoads() {
        assertFalse(BackNavigationPolicy.shouldNavigateWebViewBack(false, true));
    }

    @Test
    public void delegatesWhenNoUsefulWebViewHistoryExists() {
        assertFalse(BackNavigationPolicy.shouldNavigateWebViewBack(true, false));
    }

    @Test
    public void navigatesWebViewHistoryAfterAppPageLoads() {
        assertTrue(BackNavigationPolicy.shouldNavigateWebViewBack(true, true));
    }
}