package com.ecoletrack.webview;

final class WebViewStatePolicy {
    private WebViewStatePolicy() {}

    static boolean canRestore(String currentUrl) {
        return WebViewNavigationPolicy.isTrustedAppUrl(currentUrl);
    }

    static boolean canRestore(String savedUrl, String restoredUrl) {
        return canRestore(savedUrl)
                && canRestore(restoredUrl)
                && savedUrl.equals(restoredUrl);
    }
}
