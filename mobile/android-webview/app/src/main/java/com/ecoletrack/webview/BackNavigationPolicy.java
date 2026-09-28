package com.ecoletrack.webview;

final class BackNavigationPolicy {
    private BackNavigationPolicy() {}

    static boolean shouldNavigateWebViewBack(boolean initialAppPageLoaded, boolean canGoBack) {
        return initialAppPageLoaded && canGoBack;
    }
}