package com.ecoletrack.webview;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "EcoleTrackAndroid";
    private String apiServerUrl;
    private static final String APP_INDEX_URL = "file:///android_asset/index.html";
    private static final String LOADING_HTML = "<!doctype html><html lang='fr'><head><meta charset='utf-8' />" +
            "<meta name='viewport' content='width=device-width,initial-scale=1' />" +
            "<style>body{margin:0;background:#020617;color:#f8fafc;font-family:system-ui,-apple-system," +
            "Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}" +
            ".card{padding:24px 28px;border-radius:18px;background:rgba(2,6,23,0.96);border:1px solid rgba(148,163,184,0.25);" +
            "box-shadow:0 18px 45px rgba(2,6,23,0.4);text-align:center;}" +
            "h1{font-size:18px;margin:0 0 8px;}p{font-size:14px;margin:0;color:#cbd5e1;}</style></head><body>" +
            "<div class='card'><h1>ÉcoleTrack</h1><p>Chargement de l’interface…</p></div></body></html>";
    private static final String ERROR_HTML = "<!doctype html><html lang='fr'><head><meta charset='utf-8' />" +
            "<meta name='viewport' content='width=device-width,initial-scale=1' />" +
            "<style>body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system," +
            "Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}" +
            ".card{padding:24px 28px;border-radius:18px;background:rgba(15,23,42,0.95);border:1px solid rgba(148,163,184,0.2);" +
            "box-shadow:0 18px 45px rgba(2,6,23,0.35);text-align:center;max-width:90vw;}" +
            "h1{font-size:18px;margin:0 0 8px;}p{font-size:14px;margin:0 0 8px;color:#cbd5e1;}code{font-size:12px;color:#93c5fd;word-break:break-all;}</style></head><body>" +
            "<div class='card'><h1>ÉcoleTrack</h1><p>Le chargement a échoué.</p><p><code>{DETAIL}</code></p></div></body></html>";
    private WebView webView;
    private String pendingFcmToken;

    private String readIndexHtmlFromAssets() throws java.io.IOException {
        try (java.io.InputStream inputStream = getAssets().open("index.html")) {
            return new String(inputStream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    private void dispatchFcmTokenToWebView(String token) {
        pendingFcmToken = token;
        if (webView == null) {
            return;
        }

        String escapedToken = token.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"");
        String script = "window.setFcmToken('" + escapedToken + "');";
        webView.post(() -> {
            if (webView != null) {
                webView.evaluateJavascript(script, null);
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        apiServerUrl = getString(R.string.api_base_url);

        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        rootLayout.addView(webView);
        setContentView(rootLayout);

        ViewCompat.setOnApplyWindowInsetsListener(rootLayout, (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        webSettings.setAllowUniversalAccessFromFileURLs(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webSettings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearCache(true);
        webView.clearHistory();
        webView.clearMatches();

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void log(String message) {
                Log.i(TAG, message);
            }
        }, "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return super.shouldInterceptRequest(view, request);
                }

                String requestUrl = request.getUrl().toString();
                if (requestUrl.contains("/index.html")) {
                    try {
                        String html = readIndexHtmlFromAssets();
                        String injection = "<script>window.ECOLETRACK_API_BASE_URL='" + apiServerUrl + "'; " +
                                "localStorage.setItem('ecoletrack_api_base_url', '" + apiServerUrl + "'); " +
                                "localStorage.setItem('ecoletrack_mobile_production', 'true'); " +
                                "window.AndroidBridge && window.AndroidBridge.log('[EcoleTrack] API base injected: ' + '" + apiServerUrl + "');</script>";
                        String modifiedHtml = html.replace("</head>", injection + "</head>");
                        return new WebResourceResponse(
                                "text/html",
                                "UTF-8",
                                new java.io.ByteArrayInputStream(modifiedHtml.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                        );
                    } catch (java.io.IOException e) {
                        // Fall back to normal loading if asset injection fails
                        return super.shouldInterceptRequest(view, request);
                    }
                }

                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                view.setBackgroundColor(Color.parseColor("#0f172a"));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.setBackgroundColor(Color.TRANSPARENT);

                if (url == null || (!url.startsWith("file:///android_asset/") && !url.contains("appassets.androidplatform.net"))) {
                    return;
                }

                // Injecte l'URL du serveur API dans localStorage et sur window pour que withApiBase() l'utilise
                String js = "window.ECOLETRACK_API_BASE_URL = '" + apiServerUrl + "'; " +
                            "localStorage.setItem('ecoletrack_api_base_url', '" + apiServerUrl + "'); " +
                            "localStorage.setItem('ecoletrack_mobile_production', 'true'); " +
                            "window.AndroidBridge && window.AndroidBridge.log('[EcoleTrack] API base set: ' + '" + apiServerUrl + "');";
                view.evaluateJavascript(js, null);

                if (pendingFcmToken != null) {
                    dispatchFcmTokenToWebView(pendingFcmToken);
                    pendingFcmToken = null;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    String message = error != null ? String.valueOf(error.getDescription()) : "Unknown error";
                    Log.e(TAG, "WebView main frame error: " + message);
                    String html = ERROR_HTML.replace("{DETAIL}", message.replace("'", "&#39;"));
                    view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request != null && request.isForMainFrame()) {
                    String message = errorResponse != null ? String.valueOf(errorResponse.getStatusCode()) : "unknown";
                    Log.e(TAG, "WebView HTTP error: " + message);
                    String html = ERROR_HTML.replace("{DETAIL}", "HTTP " + message.replace("'", "&#39;"));
                    view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                }
            }
        });
        Log.i(TAG, "API base URL configured: " + apiServerUrl);
        webView.setWebChromeClient(new WebChromeClient());

FirebaseMessaging.getInstance().getToken()
        .addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                Log.w(TAG, "Impossible de récupérer le token Firebase", task.getException());
                return;
            }

            String token = task.getResult();
            Log.i(TAG, "TOKEN_FCM_PARENT = " + token);
            dispatchFcmTokenToWebView(token);
        });

webView.setBackgroundColor(Color.parseColor("#0f172a"));
        webView.loadDataWithBaseURL(null, LOADING_HTML, "text/html", "UTF-8", null);
        // Charge l'application avec un paramètre de cache-busting
        String cachebustedUrl = APP_INDEX_URL + "?v=" + System.currentTimeMillis();
        webView.post(() -> webView.loadUrl(cachebustedUrl));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}