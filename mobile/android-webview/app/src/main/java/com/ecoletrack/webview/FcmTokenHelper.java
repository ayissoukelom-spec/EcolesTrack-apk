package com.ecoletrack.webview;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.webkit.WebView;

public class FcmTokenHelper {
    private static final String PREFS_NAME = "ecoletrack_prefs";
    private static final String PREF_FCM_TOKEN = "ecoletrack_fcm_token";

    public static final String ACTION_FCM_TOKEN_UPDATED = "com.ecoletrack.webview.ACTION_FCM_TOKEN_UPDATED";
    public static final String EXTRA_FCM_TOKEN = "com.ecoletrack.webview.EXTRA_FCM_TOKEN";

    public static void savePendingToken(Context context, String token) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(PREF_FCM_TOKEN, token).apply();
        android.util.Log.i("EcoleTrackAndroid", "[FCM_DEBUG] Saved FCM token to SharedPreferences: " + token);
    }

    public static String getSavedToken(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(PREF_FCM_TOKEN, null);
    }

    public static void clearSavedToken(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(PREF_FCM_TOKEN).apply();
    }

    public static void broadcastToken(Context context, String token) {
        Intent intent = new Intent(ACTION_FCM_TOKEN_UPDATED);
        intent.putExtra(EXTRA_FCM_TOKEN, token);
        context.sendBroadcast(intent);
    }

    public static void dispatchTokenToWebView(WebView webView, String token) {
        if (webView == null || token == null || token.isEmpty()) {
            return;
        }

        String escapedToken = token.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"");
        String script =
                "if (window.setFcmToken) {" +
                " window.setFcmToken('" + escapedToken + "');" +
                " console.log('[FCM_DEBUG] window.setFcmToken called with token');" +
                "} else {" +
                " console.log('[FCM_DEBUG] window.setFcmToken not ready');" +
                "}";

        android.util.Log.i("EcoleTrackAndroid", "[FCM_DEBUG] dispatchTokenToWebView sending token to JS: " + token);

        webView.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(script, null);
            }
        });
    }
}
