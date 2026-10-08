package com.ecoletrack.webview;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.util.Base64;
import android.util.Base64OutputStream;
import android.provider.MediaStore;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.lang.ref.WeakReference;

import com.google.firebase.messaging.FirebaseMessaging;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "EcoleTrackAndroid";
    private static final int REQUEST_POST_NOTIFICATIONS = 1001;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1002;
    private static final int REQUEST_CAMERA_PERMISSION = 1003;
    private static final long TEMPORARY_FILE_RETENTION_MILLIS = 7L * 24 * 60 * 60 * 1000;
    private String apiServerUrl;
    private static final String APP_ASSET_BASE_URL = "https://appassets.androidplatform.net/";
    private static final String APP_INDEX_URL = APP_ASSET_BASE_URL + "index.html";
    private static final String STATE_WEBVIEW = "webview_state";
    private static final String STATE_WEBVIEW_URL = "webview_url";
    private static final String STATE_PENDING_TARGET = "pending_target";
    private static final String STATE_PENDING_NOTIFICATION_ID = "pending_notification_id";
    private static final String STATE_PENDING_ATTACHMENT_COUNT = "pending_attachment_count";
    private static final String STATE_PENDING_DISPATCH_ID = "pending_dispatch_id";
    private static final String CONTENT_SECURITY_POLICY =
            "<meta http-equiv=\"Content-Security-Policy\" content=\"frame-src 'self'; child-src 'self'; object-src 'none'; base-uri 'self'\">";
    private final WebViewAssetLoader webViewAssetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
    private ValueCallback<Uri[]> filePathCallback;
    private WebChromeClient.FileChooserParams pendingFileChooserParams;
    private ValueCallback<Uri[]> pendingFileChooserCallback;
    private boolean cameraPermissionRequested;
    private boolean cameraCapturePending;
    private Uri cameraImageUri;
    private static final String CAMERA_BRIDGE_NAME = "AndroidCamera";
    private static final String CAMERA_CALLBACK_JS = "window.handleAndroidCameraResult && window.handleAndroidCameraResult('%s');";
    private static final String CAMERA_CALLBACK_BASE64_JS = "window.handleAndroidCameraResult && window.handleAndroidCameraResult('data:image/jpeg;base64,%s');";
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
    private boolean initialAppPageLoaded;
    private boolean fcmTokenReceiverRegistered;
    private String pendingFcmToken;
    private String pendingTarget;
    private String pendingNotificationId;
    private String pendingAttachmentCount;
    private String pendingDispatchId;
    private boolean notificationDispatchInFlight;
    private boolean webViewPageReady;
    private boolean notificationBridgeReady;
    private String notificationBridgeSessionId;
    private static final String EXTRA_TARGET = "target";
    private static final String EXTRA_NOTIFICATION_ID = "notificationId";
    private static final String EXTRA_ATTACHMENT_COUNT = "attachmentCount";
    private static final String EXTRA_DISPATCH_ID = "notificationDispatchId";
    private final Runnable initialPageLoadRunnable = this::loadPreparedIndexHtml;

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
            Log.i(TAG, "[FCM] Registration token update received");
            pendingFcmToken = token;
            dispatchFcmTokenToWebView(token);
        }
    };

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Log.d(TAG, "[MainActivity] onNewIntent ts=" + System.currentTimeMillis());
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) {
            Log.d(TAG, "[MainActivity] handleIncomingIntent called with null intent");
            return;
        }

        String target = intent.getStringExtra(EXTRA_TARGET);
        String notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID);
        String attachmentCount = intent.getStringExtra(EXTRA_ATTACHMENT_COUNT);
        String intentDispatchId = intent.getStringExtra(EXTRA_DISPATCH_ID);
        Log.i(TAG, "[Notification] target received from Intent = "
                + (target == null ? "<none>" : target));
        Log.d(TAG, "[MainActivity] handleIncomingIntent hasTarget=" + (target != null)
                + " hasNotificationId=" + (notificationId != null)
                + " hasAttachmentCount=" + (attachmentCount != null));
        if (target != null && !target.trim().isEmpty()) {
            if (intentDispatchId != null
                    && intentDispatchId.equals(pendingDispatchId)
                    && target.equals(pendingTarget)) {
                Log.i(TAG, "[Notification] already stored intent restored = " + intentDispatchId);
                return;
            }

            String dispatchId = java.util.UUID.randomUUID().toString();
            intent.putExtra(EXTRA_DISPATCH_ID, dispatchId);
            setIntent(intent);
            pendingTarget = target;
            pendingNotificationId = notificationId;
            pendingAttachmentCount = attachmentCount;
            pendingDispatchId = dispatchId;
            notificationDispatchInFlight = false;
            Log.i(TAG, "[Notification] pending target stored = " + target
                    + " dispatchId=" + dispatchId);
            dispatchPendingNotificationContext();
        } else {
            Log.i(TAG, "[MainActivity] no target extra received; keeping default behavior");
        }
    }

    private void dispatchPendingNotificationContext() {
        if (webView == null
                || !webViewPageReady
                || !notificationBridgeReady
                || notificationDispatchInFlight
                || pendingTarget == null
                || pendingTarget.trim().isEmpty()
                || pendingDispatchId == null) {
            return;
        }

        String target = pendingTarget;
        String notificationId = pendingNotificationId;
        String attachmentCount = pendingAttachmentCount;
        String dispatchId = pendingDispatchId;
        notificationDispatchInFlight = true;
        Log.i(TAG, "[Notification] dispatching target = " + target
                + " dispatchId=" + dispatchId);
        dispatchNotificationContextToWebView(target, notificationId, attachmentCount, dispatchId);
    }

    private void acknowledgeNotificationTarget(String dispatchId, String bridgeSessionId) {
        if (dispatchId == null
                || !dispatchId.equals(pendingDispatchId)
                || bridgeSessionId == null
                || !bridgeSessionId.equals(notificationBridgeSessionId)) {
            Log.i(TAG, "[Notification] ignoring stale JavaScript ACK = " + dispatchId
                    + " bridgeSessionId=" + bridgeSessionId);
            return;
        }

        Log.i(TAG, "[Notification] JavaScript ACK received = " + dispatchId);
        pendingTarget = null;
        pendingNotificationId = null;
        pendingAttachmentCount = null;
        pendingDispatchId = null;
        notificationDispatchInFlight = false;

        Intent currentIntent = getIntent();
        if (currentIntent != null
                && dispatchId.equals(currentIntent.getStringExtra(EXTRA_DISPATCH_ID))) {
            currentIntent.removeExtra(EXTRA_TARGET);
            currentIntent.removeExtra(EXTRA_NOTIFICATION_ID);
            currentIntent.removeExtra(EXTRA_ATTACHMENT_COUNT);
            currentIntent.removeExtra(EXTRA_DISPATCH_ID);
            setIntent(currentIntent);
        }
        Log.i(TAG, "[Notification] pending target cleared = " + dispatchId);
    }

    private final class AndroidNotificationBridge {
        @JavascriptInterface
        public void onNotificationBridgeReady(String bridgeSessionId) {
            runOnUiThread(() -> {
                if (bridgeSessionId == null || bridgeSessionId.trim().isEmpty()) {
                    Log.w(TAG, "[Notification] ignored empty JavaScript bridge session id");
                    return;
                }
                if (!bridgeSessionId.equals(notificationBridgeSessionId)) {
                    notificationBridgeSessionId = bridgeSessionId;
                    notificationDispatchInFlight = false;
                }
                notificationBridgeReady = true;
                if (webView != null && APP_INDEX_URL.equals(webView.getUrl())) {
                    webViewPageReady = true;
                }
                Log.i(TAG, "[Notification] JavaScript bridge ready = true"
                        + " bridgeSessionId=" + bridgeSessionId);
                dispatchPendingNotificationContext();
            });
        }

        @JavascriptInterface
        public void onNotificationTargetReceived(String dispatchId, String bridgeSessionId) {
            runOnUiThread(() -> acknowledgeNotificationTarget(dispatchId, bridgeSessionId));
        }
    }

    private String readIndexHtmlFromAssets() throws java.io.IOException {
        try (java.io.InputStream inputStream = getAssets().open("index.html");
             java.io.ByteArrayOutputStream outputStream = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int length;
            while ((length = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, length);
            }
            return new String(outputStream.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    private String buildApiBootstrapScript() {
        String safeApiUrl = apiServerUrl == null ? "" : apiServerUrl.replace("\\", "\\\\").replace("'", "\\'");
        return "<script>"
                + "try {"
                + "window.ECOLETRACK_API_BASE_URL = '" + safeApiUrl + "';"
                + "localStorage.setItem('ecoletrack_api_base_url', '" + safeApiUrl + "');"
                + "localStorage.setItem('ecoletrack_mobile_production', 'true');"
                + "if (window.AndroidBridge && window.AndroidBridge.log) {"
                + "window.AndroidBridge.log('[API_TRACE][A] ANDROID_INJECTION window.ECOLETRACK_API_BASE_URL = " + safeApiUrl + "');"
                + "window.AndroidBridge.log('[API_TRACE][B] ANDROID_INJECTION localStorage = " + safeApiUrl + "');"
                + "}"
                + "console.log('[API_TRACE][A] ANDROID_INJECTION window.ECOLETRACK_API_BASE_URL = " + safeApiUrl + "');"
                + "console.log('[API_TRACE][B] ANDROID_INJECTION localStorage = " + safeApiUrl + "');"
                + "} catch (e) { console.log('[API_TRACE][ERROR] initial API bootstrap failed: ' + e); }"
                + "</script>";
    }

    private String injectApiBootstrapIntoHtml(String html) {
        if (html == null || html.isEmpty()) {
            return buildApiBootstrapScript();
        }

        String securedHtml = injectWebViewContentPolicy(html);
        String injection = buildApiBootstrapScript();
        if (securedHtml.contains("</head>")) {
            return securedHtml.replace("</head>", injection + "</head>");
        }

        return injection + securedHtml;
    }

    private String injectWebViewContentPolicy(String html) {
        int headStart = html.toLowerCase(Locale.ROOT).indexOf("<head");
        if (headStart >= 0) {
            int headTagEnd = html.indexOf('>', headStart);
            if (headTagEnd >= 0) {
                return html.substring(0, headTagEnd + 1)
                        + CONTENT_SECURITY_POLICY
                        + html.substring(headTagEnd + 1);
            }
        }

        return CONTENT_SECURITY_POLICY + html;
    }

    private void loadPreparedIndexHtml() {
        try {
            String html = readIndexHtmlFromAssets();
            String modifiedHtml = injectApiBootstrapIntoHtml(html);
            Log.i(TAG, "[API_TRACE][INIT] Loading prepared index.html with Android API bootstrap: " + apiServerUrl);
            webView.loadDataWithBaseURL(
                    APP_ASSET_BASE_URL,
                    modifiedHtml,
                    "text/html",
                    "UTF-8",
                    APP_INDEX_URL
            );
        } catch (java.io.IOException e) {
            Log.e(TAG, "[API_TRACE][ERROR] Failed to prepare Android index.html bootstrap", e);
            webView.loadDataWithBaseURL(
                    APP_ASSET_BASE_URL,
                    LOADING_HTML,
                    "text/html",
                    "UTF-8",
                    APP_ASSET_BASE_URL + "loading.html"
            );
        }
    }

    private void dispatchFcmTokenToWebView(String token) {
        pendingFcmToken = token;
        if (webView == null) {
            return;
        }

        Log.i(TAG, "[FCM] Dispatching registration token to WebView");
        FcmTokenHelper.dispatchTokenToWebView(webView, token);
    }

    private void dispatchNotificationContextToWebView(
            String target,
            String notificationId,
            String attachmentCount,
            String dispatchId
    ) {
        if (webView == null || target == null || target.trim().isEmpty()) {
            Log.d(TAG, "[MainActivity] dispatchTargetToWebView skipped because webView or target is null/empty");
            return;
        }

        String escapedTarget = JavaScriptStringEscaper.quote(target);
        String escapedNotificationId = JavaScriptStringEscaper.quote(notificationId == null ? "" : notificationId);
        String escapedAttachmentCount = JavaScriptStringEscaper.quote(attachmentCount == null ? "" : attachmentCount);
        String escapedDispatchId = JavaScriptStringEscaper.quote(dispatchId);
        String js = "window.__pendingNotificationContext = { notificationId: " + escapedNotificationId + ", attachmentCount: " + escapedAttachmentCount + ", dispatchId: " + escapedDispatchId + " }; " +
                    "if (window.setNotificationTarget) { " +
                    "window.setNotificationTarget(" + escapedTarget + ", " + escapedDispatchId + "); " +
                    "delete window.__pendingNotificationContext; " +
                    "console.log('[NOTIFICATION_DEBUG] window.setNotificationTarget exists'); " +
                    "} else { " +
                    "window.__pendingNotificationTarget = " + escapedTarget + "; " +
                    "console.log('[NOTIFICATION_DEBUG] window.setNotificationTarget missing, storing pending target'); " +
                    "}";
        webView.evaluateJavascript(js, result ->
                Log.d(TAG, "[Notification] JavaScript dispatch evaluated = " + result
                        + " dispatchId=" + dispatchId));
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        cleanupTemporaryFiles();
        if (savedInstanceState != null) {
            pendingTarget = savedInstanceState.getString(STATE_PENDING_TARGET);
            pendingNotificationId = savedInstanceState.getString(STATE_PENDING_NOTIFICATION_ID);
            pendingAttachmentCount = savedInstanceState.getString(STATE_PENDING_ATTACHMENT_COUNT);
            pendingDispatchId = savedInstanceState.getString(STATE_PENDING_DISPATCH_ID);
        }

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

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                String currentUrl = webView != null ? webView.getUrl() : null;
                boolean canGoBack = webView != null && webView.canGoBack();
                boolean useWebViewHistory = BackNavigationPolicy.shouldNavigateWebViewBack(initialAppPageLoaded, canGoBack);
                Log.i(TAG, "[BACK] received initialAppPageLoaded=" + initialAppPageLoaded
                        + " canGoBack=" + canGoBack + " currentUrl=" + currentUrl);

                if (useWebViewHistory) {
                    Log.i(TAG, "[BACK] navigating WebView history from url=" + currentUrl);
                    webView.goBack();
                    return;
                }

                Log.i(TAG, "[BACK] delegating to Android; no useful WebView history");
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });

        ViewCompat.setOnApplyWindowInsetsListener(rootLayout, (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(false);
        webSettings.setAllowUniversalAccessFromFileURLs(false);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        boolean isDebuggable = (getApplicationInfo().flags
                & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        webSettings.setMixedContentMode(isDebuggable
                ? WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webSettings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.clearMatches();

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void log(String message) {
                Log.i(TAG, message);
            }
        }, "AndroidBridge");

        webView.addJavascriptInterface(new AndroidCameraBridge(), CAMERA_BRIDGE_NAME);
        webView.addJavascriptInterface(new AndroidNotificationBridge(), "AndroidNotificationBridge");

        ensureNotificationPermission();
        createNotificationChannel();
        registerReceiver(fcmTokenReceiver, new IntentFilter(FcmTokenHelper.ACTION_FCM_TOKEN_UPDATED), Context.RECEIVER_NOT_EXPORTED);
        fcmTokenReceiverRegistered = true;
        String savedFcmToken = FcmTokenHelper.getSavedToken(this);
        if (savedFcmToken != null && !savedFcmToken.isEmpty()) {
            Log.i(TAG, "[FCM] Recovered saved registration token");
            pendingFcmToken = savedFcmToken;
        } else {
            Log.i(TAG, "[FCM] No saved registration token found");
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String requestedUrl = request != null && request.getUrl() != null ? request.getUrl().toString() : null;
                Log.d(TAG, "[WebViewClient] shouldOverrideUrlLoading ts=" + System.currentTimeMillis() + " requestedUrl=" + requestedUrl + " currentUrl=" + view.getUrl());
                boolean isMainFrame = request != null && request.isForMainFrame();
                Log.d(TAG, "[WEBVIEW_TRACE] shouldOverrideUrlLoading url=" + requestedUrl
                        + " mainFrame=" + isMainFrame);
                if (isMainFrame && APP_ASSET_BASE_URL.equals(requestedUrl)) {
                    Log.d(TAG, "[WEBVIEW_TRACE] APP_ASSET_BASE_URL intercepted url=" + requestedUrl);
                    view.post(MainActivity.this::loadPreparedIndexHtml);
                    return true;
                }
                WebViewNavigationPolicy.Decision decision =
                        WebViewNavigationPolicy.decide(requestedUrl, isMainFrame);
                if (decision == WebViewNavigationPolicy.Decision.OPEN_WHATSAPP_EXTERNALLY) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(requestedUrl)));
                    } catch (ActivityNotFoundException exception) {
                        Toast.makeText(MainActivity.this, "Aucune application ne peut ouvrir WhatsApp sur cet appareil.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                return decision == WebViewNavigationPolicy.Decision.BLOCK;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    Log.d(TAG, "[WEBVIEW_TRACE] shouldInterceptRequest request/url is null");
                    return super.shouldInterceptRequest(view, request);
                }

                String requestUrl = request.getUrl().toString();
                boolean isMainFrame = request.isForMainFrame();
                boolean isTrusted = WebViewNavigationPolicy.isTrustedAppUrl(requestUrl);
                boolean isLocalHtmlDataDocument =
                        requestUrl.startsWith("data:text/html;charset=utf-8;base64,");
                Log.d(TAG, "[WEBVIEW_TRACE] shouldInterceptRequest url=" + requestUrl
                        + " mainFrame=" + isMainFrame
                        + " method=" + request.getMethod()
                        + " trusted=" + isTrusted
                        + " localHtmlData=" + isLocalHtmlDataDocument);

                if (isMainFrame && !isTrusted && !isLocalHtmlDataDocument) {
                    Log.e(TAG, "[WEBVIEW_TRACE] BLOCKED_403 url=" + requestUrl);
                    return new WebResourceResponse(
                            "text/plain",
                            "UTF-8",
                            403,
                            "Blocked by WebView navigation policy",
                            java.util.Collections.emptyMap(),
                            new java.io.ByteArrayInputStream(new byte[0])
                    );
                }

                Log.d(TAG, "[WEBVIEW_TRACE] ASSET_LOADER url=" + requestUrl);
                WebResourceResponse assetResponse =
                        webViewAssetLoader.shouldInterceptRequest(request.getUrl());
                Log.d(TAG, "[WEBVIEW_TRACE] ASSET_LOADER url=" + requestUrl
                        + " result=" + (assetResponse == null ? "NULL" : "NON_NULL"));
                return assetResponse != null ? assetResponse : super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                Log.d(TAG, "[WebViewClient] onPageStarted ts=" + System.currentTimeMillis() + " url=" + url + " currentUrl=" + view.getUrl());
                if (APP_INDEX_URL.equals(url)) {
                    webViewPageReady = false;
                    notificationBridgeReady = false;
                    notificationDispatchInFlight = false;
                    notificationBridgeSessionId = null;
                }
                view.setBackgroundColor(Color.parseColor("#0f172a"));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.d(TAG, "[WebViewClient] onPageFinished ts=" + System.currentTimeMillis() + " url=" + url + " currentUrl=" + view.getUrl());
                view.setBackgroundColor(Color.TRANSPARENT);

                if (!APP_INDEX_URL.equals(url)) {
                    return;
                }
                webViewPageReady = true;
                Log.i(TAG, "[Notification] WebView page finished = " + url);

                if (!initialAppPageLoaded) {
                    initialAppPageLoaded = true;
                    view.clearHistory();
                    Log.i(TAG, "[BACK] initial app page loaded; cleared bootstrap history url=" + url
                            + " canGoBack=" + view.canGoBack());
                }

                String safeApiUrl = apiServerUrl == null ? "" : apiServerUrl.replace("\\", "\\\\").replace("'", "\\'");
                String js = "try { " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][LATE] BEFORE_SET window.ECOLETRACK_API_BASE_URL = ' + (window.ECOLETRACK_API_BASE_URL || '<not-set>')); " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][LATE] BEFORE_SET localStorage = ' + (localStorage.getItem('ecoletrack_api_base_url') || '<not-set>')); " +
                            "window.ECOLETRACK_API_BASE_URL = '" + safeApiUrl + "'; " +
                            "localStorage.setItem('ecoletrack_api_base_url', '" + safeApiUrl + "'); " +
                            "localStorage.setItem('ecoletrack_mobile_production', 'true'); " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][LATE] AFTER_SET window.ECOLETRACK_API_BASE_URL = ' + window.ECOLETRACK_API_BASE_URL); " +
                            "window.AndroidBridge && window.AndroidBridge.log('[API_TRACE][LATE] AFTER_SET localStorage = ' + localStorage.getItem('ecoletrack_api_base_url')); " +
                            "console.log('[API_TRACE][LATE] AFTER_SET window.ECOLETRACK_API_BASE_URL = ' + window.ECOLETRACK_API_BASE_URL); " +
                            "console.log('[API_TRACE][LATE] AFTER_SET localStorage = ' + localStorage.getItem('ecoletrack_api_base_url')); " +
                            "} catch (e) { console.log('[API_TRACE][ERROR] late API bootstrap failed: ' + e); }";
                view.evaluateJavascript(js, null);

                if (pendingFcmToken != null) {
                    dispatchFcmTokenToWebView(pendingFcmToken);
                    pendingFcmToken = null;
                }

                dispatchPendingNotificationContext();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                String requestUrl = request != null && request.getUrl() != null
                        ? request.getUrl().toString() : "null";
                boolean isMainFrame = request != null && request.isForMainFrame();
                String errorCode = error != null ? String.valueOf(error.getErrorCode()) : "null";
                String errorDescription = error != null ? String.valueOf(error.getDescription()) : "null";
                Log.e(TAG, "[WEBVIEW_TRACE] LOAD_ERROR url=" + requestUrl
                        + " mainFrame=" + isMainFrame
                        + " errorCode=" + errorCode
                        + " description=" + errorDescription);
                if (request != null && request.isForMainFrame()) {
                    String message = error != null ? String.valueOf(error.getDescription()) : "Unknown error";
                    Log.e(TAG, "WebView main frame error: " + message);
                    String html = ERROR_HTML.replace("{DETAIL}", message.replace("'", "&#39;"));
                    view.loadDataWithBaseURL(
                            APP_ASSET_BASE_URL,
                            html,
                            "text/html",
                            "UTF-8",
                            APP_ASSET_BASE_URL + "error.html"
                    );
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                String requestUrl = request != null && request.getUrl() != null
                        ? request.getUrl().toString() : "null";
                boolean isMainFrame = request != null && request.isForMainFrame();
                String statusCode = errorResponse != null
                        ? String.valueOf(errorResponse.getStatusCode()) : "null";
                String reasonPhrase = errorResponse != null
                        ? String.valueOf(errorResponse.getReasonPhrase()) : "null";
                Log.e(TAG, "[WEBVIEW_TRACE] HTTP_ERROR url=" + requestUrl
                        + " mainFrame=" + isMainFrame
                        + " status=" + statusCode
                        + " reason=" + reasonPhrase);
                if (request != null && request.isForMainFrame()) {
                    String message = errorResponse != null ? String.valueOf(errorResponse.getStatusCode()) : "unknown";
                    Log.e(TAG, "WebView HTTP error: " + message);
                    String html = ERROR_HTML.replace("{DETAIL}", "HTTP " + message.replace("'", "&#39;"));
                    view.loadDataWithBaseURL(
                            APP_ASSET_BASE_URL,
                            html,
                            "text/html",
                            "UTF-8",
                            APP_ASSET_BASE_URL + "error.html"
                    );
                }
            }
        });
        Log.i(TAG, "API base URL configured: " + apiServerUrl);
        webView.setWebChromeClient(new EcoleTrackWebChromeClient());

        FirebaseMessaging.getInstance().getToken()
            .addOnCompleteListener(this, task -> {
                if (!task.isSuccessful()) {
                    Log.w(TAG, "Impossible de récupérer le token Firebase", task.getException());
                    return;
                }

                String token = task.getResult();
                Log.i(TAG, "[FCM] Firebase registration token fetched");
                FcmTokenHelper.savePendingToken(MainActivity.this, token);
                dispatchFcmTokenToWebView(token);
            });

        webView.setBackgroundColor(Color.parseColor("#0f172a"));
        boolean restoredWebView = restoreWebViewState(savedInstanceState);
        Log.i(TAG, "[Notification] WebView restored = " + restoredWebView);
        if (restoredWebView) {
            webViewPageReady = false;
        } else {
            webView.clearHistory();
            webView.loadDataWithBaseURL(
                    APP_ASSET_BASE_URL,
                    LOADING_HTML,
                    "text/html",
                    "UTF-8",
                    APP_ASSET_BASE_URL + "loading.html"
            );
            webView.post(initialPageLoadRunnable);
        }
    }

    private boolean restoreWebViewState(Bundle savedInstanceState) {
        if (savedInstanceState == null) {
            return false;
        }

        String savedUrl = savedInstanceState.getString(STATE_WEBVIEW_URL);
        Bundle webViewState = savedInstanceState.getBundle(STATE_WEBVIEW);
        if (!WebViewStatePolicy.canRestore(savedUrl) || webViewState == null) {
            return false;
        }

        try {
            android.webkit.WebBackForwardList restoredHistory = webView.restoreState(webViewState);
            if (restoredHistory == null
                    || restoredHistory.getCurrentItem() == null
                    || !WebViewStatePolicy.canRestore(
                            savedUrl,
                            restoredHistory.getCurrentItem().getUrl()
                    )) {
                webView.clearHistory();
                return false;
            }

            initialAppPageLoaded = true;
            Log.i(TAG, "[WEBVIEW] Restored trusted page state");
            return true;
        } catch (RuntimeException exception) {
            Log.w(TAG, "[WEBVIEW] Saved state could not be restored; loading the app afresh", exception);
            webView.clearHistory();
            return false;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null && WebViewStatePolicy.canRestore(webView.getUrl())) {
            Bundle webViewState = new Bundle();
            android.webkit.WebBackForwardList savedHistory = webView.saveState(webViewState);
            if (savedHistory != null) {
                outState.putBundle(STATE_WEBVIEW, webViewState);
                outState.putString(STATE_WEBVIEW_URL, webView.getUrl());
            }
        }
        outState.putString(STATE_PENDING_TARGET, pendingTarget);
        outState.putString(STATE_PENDING_NOTIFICATION_ID, pendingNotificationId);
        outState.putString(STATE_PENDING_ATTACHMENT_COUNT, pendingAttachmentCount);
        outState.putString(STATE_PENDING_DISPATCH_ID, pendingDispatchId);
        super.onSaveInstanceState(outState);
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
            return;
        }

        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            cameraPermissionRequested = false;
            if (granted) {
                Log.i(TAG, "CAMERA permission granted");
                if (cameraCapturePending) {
                    cameraCapturePending = false;
                    launchCameraCapture();
                    return;
                }
                if (pendingFileChooserCallback != null && pendingFileChooserParams != null) {
                    openFileChooserWithCameraOption(pendingFileChooserCallback, pendingFileChooserParams);
                }
                return;
            }

            Log.w(TAG, "CAMERA permission denied; file picker remains available without camera capture");
            cameraCapturePending = false;
            if (pendingFileChooserCallback != null && pendingFileChooserParams != null) {
                openFileChooserWithoutCameraOption(pendingFileChooserCallback, pendingFileChooserParams);
            }
            return;
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

    private File createCameraImageFile() throws IOException {
        File imageDir = new File(getCacheDir(), "camera");
        if (!imageDir.exists() && !imageDir.mkdirs()) {
            throw new IOException("Unable to create camera directory");
        }

        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File imageFile = File.createTempFile("camera_" + timestamp + "_", ".jpg", imageDir);
        cameraImageUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                imageFile
        );
        return imageFile;
    }

    private void cleanupTemporaryFiles() {
        long nowMillis = System.currentTimeMillis();
        cleanTemporaryDirectory(new File(getCacheDir(), "camera"), nowMillis);
        cleanTemporaryDirectory(new File(getCacheDir(), "attachments"), nowMillis);
    }

    private void cleanTemporaryDirectory(File directory, long nowMillis) {
        try {
            int deletedCount = TemporaryFilePolicy.deleteExpiredFiles(
                    directory,
                    nowMillis,
                    TEMPORARY_FILE_RETENTION_MILLIS
            );
            if (deletedCount > 0) {
                Log.i(TAG, "Removed " + deletedCount + " expired files from app cache");
            }
        } catch (IOException exception) {
            Log.e(TAG, "Unable to clean expired files in app cache directory", exception);
        }
    }

    private String[] normalizeAcceptedMimeTypes(String[] acceptTypes) {
        return DocumentSelectionPolicy.normalizeAcceptedMimeTypes(acceptTypes);
    }

    private String resolveMimeType(Uri uri) {
        if (uri == null) {
            return null;
        }

        try {
            String mimeType = getContentResolver().getType(uri);
            if (mimeType != null && !mimeType.trim().isEmpty()) {
                return mimeType;
            }
        } catch (Exception e) {
            Log.w(TAG, "Unable to resolve MIME type for selected document", e);
        }

        String path = uri.getPath();
        if (path == null) {
            return null;
        }

        String lowerPath = path.toLowerCase(Locale.US);
        if (lowerPath.endsWith(".xlsx")) {
            return DocumentSelectionPolicy.EXCEL_XLSX_MIME;
        }
        if (lowerPath.endsWith(".xls")) {
            return DocumentSelectionPolicy.EXCEL_XLS_MIME;
        }
        if (lowerPath.endsWith(".pdf")) {
            return "application/pdf";
        }
        if (lowerPath.endsWith(".png")) {
            return "image/png";
        }
        if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
            return "image/jpeg";
        }

        return null;
    }

    private boolean isAllowedSelectedDocument(Uri uri) {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) {
            Log.w(TAG, "Rejected selected document with a non-content URI scheme");
            return false;
        }

        boolean hasReadPermission = checkUriPermission(
                uri,
                android.os.Process.myPid(),
                android.os.Process.myUid(),
                Intent.FLAG_GRANT_READ_URI_PERMISSION
        ) == PackageManager.PERMISSION_GRANTED;
        String mimeType = resolveMimeType(uri);
        String displayName = resolveDisplayName(uri);
        boolean allowed = DocumentSelectionPolicy.isAllowed(
                uri.toString(),
                mimeType,
                displayName,
                hasReadPermission
        );
        if (!allowed) {
            Log.w(TAG, "Rejected selected document due to unsupported type or missing read access");
        }
        return allowed;
    }

    private String resolveDisplayName(Uri uri) {
        if (uri == null) {
            return null;
        }

        String[] projection = { android.provider.OpenableColumns.DISPLAY_NAME };
        try (android.database.Cursor cursor = getContentResolver().query(uri, projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndexOrThrow(android.provider.OpenableColumns.DISPLAY_NAME);
                String displayName = cursor.getString(index);
                if (displayName != null && !displayName.trim().isEmpty()) {
                    return displayName;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Unable to resolve selected document display name", e);
        }

        String path = uri.getPath();
        if (path != null && path.lastIndexOf('/') >= 0) {
            return path.substring(path.lastIndexOf('/') + 1);
        }
        return null;
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestCameraPermissionIfNeeded() {
        if (!cameraPermissionRequested && !hasCameraPermission()) {
            cameraPermissionRequested = true;
            try {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{android.Manifest.permission.CAMERA},
                        REQUEST_CAMERA_PERMISSION
                );
            } catch (IllegalStateException | SecurityException e) {
                cameraPermissionRequested = false;
                cameraCapturePending = false;
                Log.e("EcoleTrackCamera", "Unable to request CAMERA permission", e);
            }
            return;
        }

        if (hasCameraPermission() && pendingFileChooserCallback != null && pendingFileChooserParams != null) {
            openFileChooserWithCameraOption(pendingFileChooserCallback, pendingFileChooserParams);
        }
    }

    private void openFileChooserWithoutCameraOption(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (filePathCallback != null && filePathCallback != callback) {
            ValueCallback<Uri[]> previousCallback = filePathCallback;
            filePathCallback = null;
            previousCallback.onReceiveValue(null);
        }
        filePathCallback = callback;
        pendingFileChooserCallback = callback;
        pendingFileChooserParams = params;

        Intent contentSelectionIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
        contentSelectionIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        contentSelectionIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        contentSelectionIntent.setType("*/*");

        String[] acceptedMimeTypes = normalizeAcceptedMimeTypes(params != null ? params.getAcceptTypes() : null);
        if (acceptedMimeTypes != null && acceptedMimeTypes.length > 0) {
            contentSelectionIntent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes);
            contentSelectionIntent.setType("*/*");
        }

        Intent chooserIntent = Intent.createChooser(contentSelectionIntent, "Choisir un fichier");
        try {
            startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE);
        } catch (ActivityNotFoundException | SecurityException | IllegalStateException e) {
            Log.e(TAG, "Unable to launch file chooser", e);
            resetFileChooserCallback();
        }
    }

    private void launchCameraCapture() {
        Log.d("EcoleTrackCamera", "Launching camera");

        if (!hasCameraPermission()) {
            Log.w("EcoleTrackCamera", "Camera permission missing; requesting it first");
            cameraCapturePending = true;
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{android.Manifest.permission.CAMERA},
                    REQUEST_CAMERA_PERMISSION
            );
            return;
        }

        PackageManager packageManager = getPackageManager();
        if (packageManager == null) {
            Log.w("EcoleTrackCamera", "PackageManager unavailable while launching camera");
            return;
        }

        Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (cameraIntent.resolveActivity(packageManager) == null) {
            Log.e("EcoleTrackCamera", "No camera application available");
            return;
        }

        try {
            createCameraImageFile();
        } catch (IOException | IllegalArgumentException e) {
            Log.e("EcoleTrackCamera", "Unable to create temporary photo file for direct camera capture", e);
            return;
        }

        if (cameraImageUri == null) {
            Log.e("EcoleTrackCamera", "Camera capture URI is null before launching camera");
            return;
        }

        Log.d("EcoleTrackCamera", "Photo URI: " + cameraImageUri);
        cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
        cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        cameraIntent.setClipData(ClipData.newRawUri("camera_output", cameraImageUri));
        cameraIntent.putExtra("android.intent.extra.OUTPUT", cameraImageUri);
        try {
            startActivityForResult(cameraIntent, FILE_CHOOSER_REQUEST_CODE);
        } catch (ActivityNotFoundException | SecurityException | IllegalStateException e) {
            Log.e("EcoleTrackCamera", "Unable to launch camera capture", e);
            cameraImageUri = null;
        }
    }

    private void openCameraCapture(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        pendingFileChooserCallback = callback;
        pendingFileChooserParams = params;
        cameraCapturePending = true;

        if (!hasCameraPermission()) {
            requestCameraPermissionIfNeeded();
            return;
        }

        cameraCapturePending = false;
        launchCameraCapture();
    }

    private void openFileChooserWithCameraOption(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (filePathCallback != null && filePathCallback != callback) {
            ValueCallback<Uri[]> previousCallback = filePathCallback;
            filePathCallback = null;
            previousCallback.onReceiveValue(null);
        }
        filePathCallback = callback;
        pendingFileChooserCallback = callback;
        pendingFileChooserParams = params;

        Intent contentSelectionIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
        contentSelectionIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        contentSelectionIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        contentSelectionIntent.setType("*/*");

        String[] acceptedMimeTypes = normalizeAcceptedMimeTypes(params != null ? params.getAcceptTypes() : null);
        if (acceptedMimeTypes != null && acceptedMimeTypes.length > 0) {
            contentSelectionIntent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes);
            contentSelectionIntent.setType("*/*");
        }

        Intent captureIntent = null;
        PackageManager packageManager = getPackageManager();
        if (packageManager != null) {
            Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (cameraIntent.resolveActivity(packageManager) != null) {
                if (!hasCameraPermission()) {
                    requestCameraPermissionIfNeeded();
                    return;
                }
                try {
                    File photoFile = createCameraImageFile();
                    captureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    captureIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
                    captureIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    captureIntent.putExtra("android.intent.extra.OUTPUT", cameraImageUri);
                } catch (IOException | IllegalArgumentException e) {
                    Log.e(TAG, "Unable to create temporary photo file for capture", e);
                    captureIntent = null;
                }
            }
        }

        Intent chooserIntent = Intent.createChooser(contentSelectionIntent, "Choisir un fichier");
        if (captureIntent != null) {
            captureIntent.setClipData(ClipData.newRawUri("camera_output", cameraImageUri));
            chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{captureIntent});
        }

        try {
            startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE);
        } catch (ActivityNotFoundException | SecurityException | IllegalStateException e) {
            Log.e(TAG, "Unable to launch file chooser with camera option", e);
            resetFileChooserCallback();
        }
    }

    private String readCameraPayloadAsBase64(Uri uri) {
        if (uri == null) {
            return null;
        }

        try (InputStream inputStream = getContentResolver().openInputStream(uri)) {
            if (inputStream == null) {
                Log.w("EcoleTrackCamera", "openInputStream returned null for captured photo URI: " + uri);
                return null;
            }

            ByteArrayOutputStream encodedBytes = new ByteArrayOutputStream();
            try (OutputStream base64OutputStream = new Base64OutputStream(encodedBytes, Base64.NO_WRAP)) {
                byte[] buffer = new byte[4096];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    base64OutputStream.write(buffer, 0, bytesRead);
                }
            }

            String encoded = encodedBytes.toString("US-ASCII");
            Log.d("EcoleTrackCamera", "Captured photo was encoded for the WebView callback");
            return encoded;
        } catch (IOException e) {
            Log.e("EcoleTrackCamera", "Unable to read captured photo bytes from URI: " + uri, e);
            return null;
        }
    }

    private void postCameraCallback(String javascript) {
        WebView currentWebView = webView;
        if (currentWebView == null) {
            return;
        }

        WeakReference<WebView> webViewReference = new WeakReference<>(currentWebView);
        currentWebView.post(() -> {
            WebView target = webViewReference.get();
            if (target != null) {
                target.evaluateJavascript(javascript, null);
            }
        });
    }

    private void completeFileChooserRequest(Uri[] result) {
        ValueCallback<Uri[]> callback = filePathCallback;
        filePathCallback = null;
        pendingFileChooserCallback = null;
        pendingFileChooserParams = null;
        cameraImageUri = null;
        if (callback != null) {
            callback.onReceiveValue(result);
        }
    }

    private void resetFileChooserCallback() {
        ValueCallback<Uri[]> callback = filePathCallback;
        filePathCallback = null;
        pendingFileChooserCallback = null;
        pendingFileChooserParams = null;
        cameraImageUri = null;
        if (callback != null) {
            callback.onReceiveValue(null);
        }
    }

    private String normalizeAttachmentMimeType(String mimeType, String fileName) {
        String normalized = mimeType == null ? "" : mimeType.trim().toLowerCase(Locale.US);
        if (normalized.contains(";")) {
            normalized = normalized.split(";", 2)[0].trim();
        }

        if (normalized.equals("image/jpg") || normalized.equals("image/pjpeg")) {
            normalized = "image/jpeg";
        }

        if (normalized.equals("application/pdf")
                || normalized.equals("image/png")
                || normalized.equals("image/jpeg")) {
            return normalized;
        }

        String lowerFileName = fileName == null ? "" : fileName.toLowerCase(Locale.US);
        if (lowerFileName.endsWith(".pdf")) return "application/pdf";
        if (lowerFileName.endsWith(".png")) return "image/png";
        if (lowerFileName.endsWith(".jpg") || lowerFileName.endsWith(".jpeg")) return "image/jpeg";

        return "";
    }

    private String buildAttachmentFileName(String fileName, String mimeType) {
        String sanitizedName = new File(fileName == null ? "attachment" : fileName).getName().replaceAll("[^a-zA-Z0-9._-]", "_");
        if (sanitizedName.isEmpty()) {
            sanitizedName = "attachment";
        }

        String normalizedMimeType = normalizeAttachmentMimeType(mimeType, sanitizedName);
        String extension;
        if (normalizedMimeType.equals("application/pdf")) {
            extension = ".pdf";
        } else if (normalizedMimeType.equals("image/png")) {
            extension = ".png";
        } else if (normalizedMimeType.equals("image/jpeg")) {
            extension = ".jpg";
        } else {
            extension = "";
        }

        int lastDot = sanitizedName.lastIndexOf('.');
        String nameWithoutExtension = lastDot > 0 ? sanitizedName.substring(0, lastDot) : sanitizedName;
        if (extension.isEmpty()) {
            return sanitizedName;
        }

        return nameWithoutExtension + extension;
    }

    private final class AndroidCameraBridge {
        @JavascriptInterface
        public void takePhoto() {
            Log.d("EcoleTrackCamera", "takePhoto() called");
            runOnUiThread(() -> launchCameraCapture());
        }

        @JavascriptInterface
        public boolean openDownloadedFile(String base64, String fileName, String mimeType) {
            Log.i(TAG, "[ATTACHMENT] bridge called mime=" + mimeType + " base64Length=" + (base64 == null ? 0 : base64.length()));

            if (base64 == null || base64.isEmpty() || fileName == null || fileName.trim().isEmpty()) {
                Log.e(TAG, "[ATTACHMENT] bridge failed: missing base64 or fileName");
                return false;
            }

            String normalizedMimeType = normalizeAttachmentMimeType(mimeType, fileName);
            if (normalizedMimeType.isEmpty()) {
                Log.e(TAG, "[ATTACHMENT] bridge failed: unsupported mimeType=" + mimeType + " fileName=" + fileName);
                return false;
            }

            try {
                File attachmentDirectory = new File(getCacheDir(), "attachments");
                if (!attachmentDirectory.exists() && !attachmentDirectory.mkdirs()) {
                    Log.e(TAG, "[ATTACHMENT] file write failed: cannot create cache dir");
                    return false;
                }

                String safeFileName = buildAttachmentFileName(fileName, normalizedMimeType);
                if (safeFileName.isEmpty()) {
                    Log.e(TAG, "[ATTACHMENT] file write failed: empty target file name");
                    return false;
                }

                File attachmentFile = new File(attachmentDirectory, safeFileName);
                byte[] fileBytes = Base64.decode(base64, Base64.DEFAULT);
                Log.i(TAG, "[ATTACHMENT] writing file path=" + attachmentFile.getAbsolutePath() + " size=" + fileBytes.length + " mime=" + normalizedMimeType);

                try (java.io.FileOutputStream outputStream = new java.io.FileOutputStream(attachmentFile)) {
                    outputStream.write(fileBytes);
                    outputStream.flush();
                    outputStream.getFD().sync();
                }

                Log.i(TAG, "[ATTACHMENT] file written path=" + attachmentFile.getAbsolutePath() + " size=" + attachmentFile.length());

                Uri contentUri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        attachmentFile
                );
                Log.i(TAG, "[ATTACHMENT] contentUri=" + contentUri);

                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                viewIntent.setDataAndType(contentUri, normalizedMimeType);
                viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

                if (viewIntent.resolveActivity(getPackageManager()) == null) {
                    Log.w(TAG, "[ATTACHMENT] no compatible Android activity for mime=" + normalizedMimeType + " uri=" + contentUri);
                    Toast.makeText(
                            MainActivity.this,
                            "Aucune application compatible n’est installée pour ouvrir ce fichier.",
                            Toast.LENGTH_LONG
                    ).show();
                    return false;
                }

                Log.i(TAG, "[ATTACHMENT] opening external app with intent mime=" + normalizedMimeType + " uri=" + contentUri);
                runOnUiThread(() -> {
                    try {
                        startActivity(Intent.createChooser(viewIntent, "Ouvrir le fichier"));
                    } catch (ActivityNotFoundException e) {
                        Log.w(TAG, "[ATTACHMENT] no compatible Android activity", e);
                        Toast.makeText(
                                MainActivity.this,
                                "Aucune application compatible n’est installée pour ouvrir ce fichier.",
                                Toast.LENGTH_LONG
                        ).show();
                    }
                });
                return true;
            } catch (Exception e) {
                Log.e(TAG, "[ATTACHMENT] bridge failed", e);
                Toast.makeText(
                        MainActivity.this,
                        "Impossible d’ouvrir ce fichier sur cet appareil.",
                        Toast.LENGTH_LONG
                ).show();
                return false;
            }
        }
    }

    private final class EcoleTrackWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
        ) {
            pendingFileChooserCallback = callback;
            pendingFileChooserParams = params;

            if (params != null && params.isCaptureEnabled()) {
                Log.i(TAG, "Detected direct camera capture request from file input; launching camera immediately");
                openCameraCapture(callback, params);
                return true;
            }

            Log.i(TAG, "Detected regular file selection request; opening chooser with document picker");
            openFileChooserWithCameraOption(callback, params);
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            Uri[] result = null;

            if (resultCode == RESULT_OK) {
                Log.d(TAG, "File chooser returned a selection");
                if (data != null) {
                    ClipData clipData = data.getClipData();
                    if (clipData != null) {
                        result = new Uri[clipData.getItemCount()];
                        for (int i = 0; i < clipData.getItemCount(); i++) {
                            Uri uri = clipData.getItemAt(i).getUri();
                            if (uri == null || !isAllowedSelectedDocument(uri)) {
                                result = null;
                                break;
                            }
                            result[i] = uri;
                        }
                    } else if (data.getData() != null) {
                        Uri uri = data.getData();
                        if (isAllowedSelectedDocument(uri)) {
                            result = new Uri[]{uri};
                        }
                    }
                }

                boolean pickerReturnedNoDocument = data == null
                        || (data.getData() == null && data.getClipData() == null);
                if (result == null && pickerReturnedNoDocument && cameraImageUri != null) {
                    result = new Uri[]{cameraImageUri};
                    Log.d("EcoleTrackCamera", "cameraImageUri after result = " + cameraImageUri);

                    String base64Payload = readCameraPayloadAsBase64(cameraImageUri);
                    if (base64Payload != null && !base64Payload.isEmpty()) {
                        String js = String.format(Locale.US, CAMERA_CALLBACK_BASE64_JS, base64Payload);
                        Log.d("EcoleTrackCamera", "Returning captured image to JS callback");
                        postCameraCallback(js);
                    } else {
                        Log.w("EcoleTrackCamera", "Unable to read captured file bytes; falling back to URI callback");
                        String js = String.format(Locale.US, CAMERA_CALLBACK_JS, cameraImageUri.toString().replace("'", "\\'"));
                        postCameraCallback(js);
                    }
                }
            } else {
                Log.w("EcoleTrackCamera", "onActivityResult resultCode was not RESULT_OK: " + resultCode);
            }

            completeFileChooserRequest(result);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
        Log.d(TAG, "[MainActivity] onResume ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
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
        if (fcmTokenReceiverRegistered) {
            unregisterReceiver(fcmTokenReceiver);
            fcmTokenReceiverRegistered = false;
        }
        if (webView != null) {
            webView.removeCallbacks(initialPageLoadRunnable);
            resetFileChooserCallback();
            webView.stopLoading();
            webView.removeAllViews();
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.destroy();
            webView = null;
        } else {
            resetFileChooserCallback();
        }
        super.onDestroy();
        cameraPermissionRequested = false;
        cameraCapturePending = false;
        Log.d(TAG, "[MainActivity] onDestroy ts=" + System.currentTimeMillis());
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        Log.d(TAG, "[MainActivity] onRestart ts=" + System.currentTimeMillis() + " url=" + (webView != null ? webView.getUrl() : "null"));
    }

}