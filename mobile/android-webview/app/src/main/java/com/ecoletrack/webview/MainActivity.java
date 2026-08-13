package com.ecoletrack.webview;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
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
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "EcoleTrackAndroid";
    private static final int REQUEST_POST_NOTIFICATIONS = 1001;
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
    private String pendingTarget;
    private static final String EXTRA_TARGET = "target";

    private final BroadcastReceiver fcmTokenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) {
                return;
            }
            String token = intent.getStringExtra(FcmTokenHelper.EXTRA_FCM_TOKEN);
            if (token == null || token.isEmpty()) {
                return;
            }
            Log.i(TAG, "[FCM_DEBUG] Broadcast received token: " + token);
            pendingFcmToken = token;
            dispatchFcmTokenToWebView(token);
        }
    };

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Log.d(TAG, "[MainActivity] onNewIntent ts=" + System.currentTimeMillis() + " intent=" + intent);
        if (intent != null) {
            Log.d(TAG, "[MainActivity] onNewIntent targetExtra=" + intent.getStringExtra(EXTRA_TARGET));
        }
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) {
            Log.d(TAG, "[MainActivity] handleIncomingIntent called with null intent");
            return;
        }

        String target = intent.getStringExtra(EXTRA_TARGET);
        Log.d(TAG, "[MainActivity] handleIncomingIntent targetExtra=" + target);
        if (target != null && !target.trim().isEmpty()) {
            pendingTarget = target;
            Log.i(TAG, "[MainActivity] received target extra from intent: " + target);
            if (webView != null) {
                dispatchTargetToWebView(target);
                pendingTarget = null;
            }
        } else {
            Log.i(TAG, "[MainActivity] no target extra received; keeping default behavior");
        }
    }

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

        Log.i(TAG, "[FCM_DEBUG] dispatchFcmTokenToWebView called with token: " + token);
        FcmTokenHelper.dispatchTokenToWebView(webView, token);
    }

    private void dispatchTargetToWebView(String target) {
        if (webView == null || target == null || target.trim().isEmpty()) {
            Log.d(TAG, "[MainActivity] dispatchTargetToWebView skipped because webView or target is null/empty");
            return;
        }

        String escapedTarget = target.replace("\\", "\\\\").replace("'", "\\'");
        String js = "if (window.setNotificationTarget) { " +
                    "window.setNotificationTarget('" + escapedTarget + "'); " +
                    "console.log('[NOTIFICATION_DEBUG] window.setNotificationTarget exists'); " +
                    "} else { " +
                    "window.__pendingNotificationTarget = '" + escapedTarget + "'; " +
                    "console.log('[NOTIFICATION_DEBUG] window.setNotificationTarget missing, storing pending target'); " +
                    "}";
        Log.d(TAG, "[MainActivity] dispatchTargetToWebView target=" + target);
        Log.d(TAG, "[MainActivity] dispatchTargetToWebView js=" + js);
        webView.evaluateJavascript(js, null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIncomingIntent(getIntent());

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
        Log.d(TAG, "[MainActivity] onCreate ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));

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

        ensureNotificationPermission();
        createNotificationChannel();
        registerReceiver(fcmTokenReceiver, new IntentFilter(FcmTokenHelper.ACTION_FCM_TOKEN_UPDATED), Context.RECEIVER_NOT_EXPORTED);
        String savedFcmToken = FcmTokenHelper.getSavedToken(this);
        if (savedFcmToken != null && !savedFcmToken.isEmpty()) {
            Log.i(TAG, "[FCM_DEBUG] Recovered saved FCM token from SharedPreferences: " + savedFcmToken);
            pendingFcmToken = savedFcmToken;
        } else {
            Log.i(TAG, "[FCM_DEBUG] No saved FCM token found in SharedPreferences");
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String requestedUrl = request != null && request.getUrl() != null ? request.getUrl().toString() : "null";
                Log.d(TAG, "[WebViewClient] shouldOverrideUrlLoading ts=" + System.currentTimeMillis() + " requestedUrl=" + requestedUrl + " currentUrl=" + view.getUrl());
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return super.shouldInterceptRequest(view, request);
                }

                String requestUrl = request.getUrl().toString();
                if (requestUrl.contains("/index.html")) {
                    try {
                        String html = readIndexHtmlFromAssets();
                        String injection = "<script>"
                                + "window.__ECOLETRACK_ANDROID_API_BASE_URL='" + apiServerUrl + "';"
                                + "window.__ECOLETRACK_API_DIAGNOSTICS__ = Object.assign({}, window.__ECOLETRACK_API_DIAGNOSTICS__, { androidResource: '" + apiServerUrl + "', windowValue: window.ECOLETRACK_API_BASE_URL || '<not-set>', localStorageValue: localStorage.getItem('ecoletrack_api_base_url') || '<not-set>' });"
                                + "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][1] ANDROID RESOURCE apiServerUrl = " + apiServerUrl + "');"
                                + "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][2] BEFORE_WEBVIEW_LOAD window.ECOLETRACK_API_BASE_URL = ' + (window.ECOLETRACK_API_BASE_URL || '<not-set>'));"
                                + "console.log('[API_TRACE][1] ANDROID RESOURCE apiServerUrl = " + apiServerUrl + "');"
                                + "console.log('[API_TRACE][2] BEFORE_WEBVIEW_LOAD window.ECOLETRACK_API_BASE_URL = ' + (window.ECOLETRACK_API_BASE_URL || '<not-set>'));"
                                + "window.ECOLETRACK_API_BASE_URL='" + apiServerUrl + "';"
                                + "localStorage.setItem('ecoletrack_api_base_url', '" + apiServerUrl + "');"
                                + "localStorage.setItem('ecoletrack_mobile_production', 'true');"
                                + "window.__ECOLETRACK_API_DIAGNOSTICS__ = Object.assign({}, window.__ECOLETRACK_API_DIAGNOSTICS__, { androidResource: '" + apiServerUrl + "', windowValue: window.ECOLETRACK_API_BASE_URL || '<not-set>', localStorageValue: localStorage.getItem('ecoletrack_api_base_url') || '<not-set>' });"
                                + "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][3] INJECTION_ANDROID window.ECOLETRACK_API_BASE_URL = ' + window.ECOLETRACK_API_BASE_URL);"
                                + "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][4] LOCAL_STORAGE after injection = ' + localStorage.getItem('ecoletrack_api_base_url'));"
                                + "console.log('[API_TRACE][3] INJECTION_ANDROID window.ECOLETRACK_API_BASE_URL = ' + window.ECOLETRACK_API_BASE_URL);"
                                + "console.log('[API_TRACE][4] LOCAL_STORAGE after injection = ' + localStorage.getItem('ecoletrack_api_base_url'));"
                                + "</script>";
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
                Log.d(TAG, "[WebViewClient] onPageStarted ts=" + System.currentTimeMillis() + " url=" + url + " currentUrl=" + view.getUrl());
                view.setBackgroundColor(Color.parseColor("#0f172a"));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.d(TAG, "[WebViewClient] onPageFinished ts=" + System.currentTimeMillis() + " url=" + url + " currentUrl=" + view.getUrl());
                view.setBackgroundColor(Color.TRANSPARENT);

                if (url == null || (!url.startsWith("file:///android_asset/") && !url.contains("appassets.androidplatform.net"))) {
                    return;
                }

                // Injecte l'URL du serveur API dans localStorage et sur window pour que withApiBase() l'utilise
                String js = "window.__ECOLETRACK_ANDROID_API_BASE_URL = '" + apiServerUrl + "'; " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][5] AFTER_PAGE_FINISHED before set window.ECOLETRACK_API_BASE_URL = ' + (window.ECOLETRACK_API_BASE_URL || '<not-set>')); " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][5] AFTER_PAGE_FINISHED before set localStorage = ' + (localStorage.getItem('ecoletrack_api_base_url') || '<not-set>')); " +
                            "window.ECOLETRACK_API_BASE_URL = '" + apiServerUrl + "'; " +
                            "localStorage.setItem('ecoletrack_api_base_url', '" + apiServerUrl + "'); " +
                            "localStorage.setItem('ecoletrack_mobile_production', 'true'); " +
                            "window.__ECOLETRACK_API_DIAGNOSTICS__ = Object.assign({}, window.__ECOLETRACK_API_DIAGNOSTICS__, { androidResource: '" + apiServerUrl + "', windowValue: window.ECOLETRACK_API_BASE_URL || '<not-set>', localStorageValue: localStorage.getItem('ecoletrack_api_base_url') || '<not-set>' }); " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][5] AFTER_PAGE_FINISHED window.ECOLETRACK_API_BASE_URL = ' + window.ECOLETRACK_API_BASE_URL); " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][5] AFTER_PAGE_FINISHED localStorage = ' + localStorage.getItem('ecoletrack_api_base_url')); " +
                            "console.log('[API_TRACE][5] AFTER_PAGE_FINISHED window.ECOLETRACK_API_BASE_URL = ' + window.ECOLETRACK_API_BASE_URL); " +
                            "console.log('[API_TRACE][5] AFTER_PAGE_FINISHED localStorage = ' + localStorage.getItem('ecoletrack_api_base_url'));";
                view.evaluateJavascript(js, null);

                if (pendingFcmToken != null) {
                    dispatchFcmTokenToWebView(pendingFcmToken);
                    pendingFcmToken = null;
                }

                if (pendingTarget != null && !pendingTarget.trim().isEmpty()) {
                    dispatchTargetToWebView(pendingTarget);
                    pendingTarget = null;
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
                Log.i(TAG, "[FCM_DEBUG] Firebase token fetched: " + token);
                FcmTokenHelper.savePendingToken(MainActivity.this, token);
                dispatchFcmTokenToWebView(token);
            });

        webView.setBackgroundColor(Color.parseColor("#0f172a"));
        webView.loadDataWithBaseURL(null, LOADING_HTML, "text/html", "UTF-8", null);
        // Charge l'application avec un paramètre de cache-busting
        String cachebustedUrl = APP_INDEX_URL + "?v=" + System.currentTimeMillis();
        webView.post(() -> webView.loadUrl(cachebustedUrl));
    }

    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }

        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            Log.i(TAG, "POST_NOTIFICATIONS permission already granted");
            return;
        }

        Log.i(TAG, "Requesting POST_NOTIFICATIONS runtime permission");
        ActivityCompat.requestPermissions(
                this,
                new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                REQUEST_POST_NOTIFICATIONS
        );
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_POST_NOTIFICATIONS) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            Log.i(TAG, "POST_NOTIFICATIONS permission result=" + granted);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) {
                Log.e(TAG, "NotificationManager unavailable while creating channel");
                return;
            }

            NotificationChannel channel = new NotificationChannel(
                    "ecoletrack_notifications",
                    "Notifications EcoleTrack",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Alertes parents");
            manager.createNotificationChannel(channel);
            Log.i(TAG, "NotificationChannel created: ecoletrack_notifications");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.d(TAG, "[MainActivity] onResume ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));
    }

    @Override
    protected void onPause() {
        super.onPause();
        Log.d(TAG, "[MainActivity] onPause ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));
    }

    @Override
    protected void onStop() {
        super.onStop();
        Log.d(TAG, "[MainActivity] onStop ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        unregisterReceiver(fcmTokenReceiver);
        Log.d(TAG, "[MainActivity] onDestroy ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        Log.d(TAG, "[MainActivity] onRestart ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));
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