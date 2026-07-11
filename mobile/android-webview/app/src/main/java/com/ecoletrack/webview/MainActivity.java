package com.ecoletrack.webview;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {

    private static final String APP_INDEX_URL = "https://appassets.androidplatform.net/index.html";
    // Adresse IP du serveur Express sur le réseau local (à mettre à jour si l'IP change)
    private static final String API_SERVER_URL = "http://10.187.128.124:3000";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(webView);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // Injecte l'URL du serveur API dans localStorage et sur window pour que withApiBase() l'utilise
                String js = "window.ECOLETRACK_API_BASE_URL = '" + API_SERVER_URL + "'; " +
                            "localStorage.setItem('ecoletrack_api_base_url', '" + API_SERVER_URL + "');";
                view.evaluateJavascript(js, null);

                // TEMPORARY DEBUG: afficher les valeurs réellement utilisées par la WebView
                String debugJs = "(function(){ return 'ECOLETRACK_API_BASE_URL=' + window.ECOLETRACK_API_BASE_URL + ' | localStorage=' + localStorage.getItem('ecoletrack_api_base_url'); })();";
                view.evaluateJavascript(debugJs, value -> {
                    String message = "API URL used: " + value;
                    android.widget.Toast.makeText(MainActivity.this, message, android.widget.Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    String message = error != null ? String.valueOf(error.getDescription()) : "Unknown error";
                    String html = "<html><body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px'>"
                            + "<h2>EcoleTrack - Erreur de chargement</h2>"
                            + "<p>Impossible de charger l'interface locale.</p>"
                            + "<p><b>Détail:</b> " + message + "</p>"
                            + "</body></html>";
                    view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        webView.setBackgroundColor(Color.BLACK);
        webView.loadUrl(APP_INDEX_URL);
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