package com.ecoletrack.webview;

import java.net.URI;
import java.net.URISyntaxException;

final class WhatsAppUrlPolicy {
    private WhatsAppUrlPolicy() {}

    static boolean shouldOpenExternally(String rawUrl) {
        if (rawUrl == null) return false;
        try {
            URI uri = new URI(rawUrl);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && "wa.me".equalsIgnoreCase(uri.getHost())
                    && uri.getUserInfo() == null
                    && uri.getPort() == -1
                    && uri.getFragment() == null
                    && uri.getPath() != null
                    && uri.getPath().matches("/[1-9][0-9]{1,14}");
        } catch (URISyntaxException exception) {
            return false;
        }
    }
}
