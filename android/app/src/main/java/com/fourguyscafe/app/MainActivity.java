package com.fourguyscafe.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    private static final String PREFS_NAME = "four_guys_cafe_native_prefs";
    private static final String KEY_PROFILE_ID = "customer_profile_id";
    private static final Pattern VALID_PROFILE_ID_PATTERN = Pattern.compile("^custprof_[a-zA-Z0-9_-]{16,64}$");

    private static class NativePrefsBridge {
        private final SharedPreferences prefs;

        NativePrefsBridge(Context context) {
            this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        }

        private static boolean isValidProfileId(String value) {
            return value != null && value.length() <= 80 && VALID_PROFILE_ID_PATTERN.matcher(value).matches();
        }

        @JavascriptInterface
        public String getProfileId() {
            String value = prefs.getString(KEY_PROFILE_ID, "");
            return isValidProfileId(value) ? value : "";
        }

        @JavascriptInterface
        public void setProfileId(String profileId) {
            if (profileId == null || profileId.trim().isEmpty()) {
                prefs.edit().remove(KEY_PROFILE_ID).apply();
                return;
            }
            String normalized = profileId.trim();
            if (!isValidProfileId(normalized)) {
                return;
            }
            prefs.edit().putString(KEY_PROFILE_ID, normalized).apply();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setGeolocationEnabled(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            webView.addJavascriptInterface(new NativePrefsBridge(this), "FourGuysNativePrefs");
        }
    }
}
