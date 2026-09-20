package kr.indexkit.app;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Checks whether a link containing {@code urlFragment} appears on a rendered
 * search-results page, and at what position — the same technique as the
 * "keyword" app's NaverRankChecker (per its own comments: a plain HTTP GET +
 * HTML parse misses results that search engines render client-side via JS,
 * so this loads the page in a real WebView, waits for it to settle, then
 * reads the DOM directly). Ported here so the same check works against
 * Google search too, not just Naver — Search Console's API requires site
 * ownership verification that's structurally impossible for blog.naver.com,
 * but this needs no verification or credentials at all.
 */
@CapacitorPlugin(name = "RankChecker")
public class RankCheckerPlugin extends Plugin {

    @SuppressLint("SetJavaScriptEnabled")
    @PluginMethod
    public void checkRank(PluginCall call) {
        String searchUrl = call.getString("searchUrl");
        String urlFragment = call.getString("urlFragment");
        int timeoutMs = call.getInt("timeoutMs", 20000);

        if (searchUrl == null || urlFragment == null) {
            call.reject("searchUrl and urlFragment are required");
            return;
        }

        String safeFragment = urlFragment.replace("\\", "\\\\").replace("'", "\\'");
        String script = "(function(){"
            + "var links = document.querySelectorAll('a[href]');"
            + "var target = '" + safeFragment + "';"
            + "for (var i = 0; i < links.length; i++) {"
            + "  if (links[i].href.indexOf(target) !== -1) return i + 1;"
            + "}"
            + "return -1;"
            + "})();";

        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setUserAgentString(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            );

            Handler handler = new Handler(Looper.getMainLooper());
            boolean[] finished = {false};

            Runnable timeoutRunnable = () -> {
                if (finished[0]) return;
                finished[0] = true;
                JSObject ret = new JSObject();
                ret.put("rank", -1);
                ret.put("error", timeoutMs + "ms 내에 검색 결과 페이지 로딩에 실패했습니다.");
                call.resolve(ret);
                webView.destroy();
            };
            handler.postDelayed(timeoutRunnable, timeoutMs);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    // Mirrors the original: wait a bit more after the load signal for
                    // late-rendered results before reading the DOM.
                    handler.postDelayed(() -> {
                        if (finished[0]) return;
                        view.evaluateJavascript(script, resultStr -> {
                            if (finished[0]) return;
                            finished[0] = true;
                            handler.removeCallbacks(timeoutRunnable);
                            int rank = -1;
                            try {
                                rank = Integer.parseInt(resultStr.trim());
                            } catch (NumberFormatException ignored) {
                            }
                            JSObject ret = new JSObject();
                            ret.put("rank", rank);
                            call.resolve(ret);
                            view.destroy();
                        });
                    }, 2000);
                }

                @Override
                public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                    super.onReceivedError(view, errorCode, description, failingUrl);
                    if (finished[0]) return;
                    finished[0] = true;
                    handler.removeCallbacks(timeoutRunnable);
                    JSObject ret = new JSObject();
                    ret.put("rank", -1);
                    ret.put("error", "페이지 로딩 실패: " + description);
                    call.resolve(ret);
                    view.destroy();
                }
            });

            webView.loadUrl(searchUrl);
        });
    }
}
