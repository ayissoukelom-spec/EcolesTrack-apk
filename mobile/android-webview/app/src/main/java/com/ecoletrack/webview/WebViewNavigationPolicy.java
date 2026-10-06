package com.ecoletrack.webview;

import java.net.URI;
import java.net.URISyntaxException;

final class WebViewNavigationPolicy {
    enum Decision {
        ALLOW_IN_WEBVIEW,
        OPEN_WHATSAPP_EXTERNALLY,
        BLOCK
    }

    private static final String APP_ASSET_HOST = "appassets.androidplatform.net";

    private WebViewNavigationPolicy() {}

    static Decision decide(String rawUrl, boolean isMainFrame) {
        if (isTrustedAppUrl(rawUrl)) {
            return Decision.ALLOW_IN_WEBVIEW;
        }
        if (isMainFrame && WhatsAppUrlPolicy.shouldOpenExternally(rawUrl)) {
            return Decision.OPEN_WHATSAPP_EXTERNALLY;
        }
        return Decision.BLOCK;
    }

    static boolean isTrustedAppUrl(String rawUrl) {
        if (rawUrl == null) {
            return false;
        }

        try {
            URI uri = new URI(rawUrl);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && APP_ASSET_HOST.equalsIgnoreCase(uri.getHost())
                    && uri.getUserInfo() == null
                    && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (URISyntaxException exception) {
            return false;
        }
    }
}
