package com.bomdiaqueridos.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Application;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.runner.screenshot.Screenshot;
import com.getcapacitor.Bridge;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.AppCheckToken;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.debug.InternalDebugSecretProvider;
import com.google.firebase.appcheck.debug.testing.DebugAppCheckTestHelper;
import io.capawesome.capacitorjs.plugins.firebase.appcheck.FirebaseAppCheckPlugin;
import java.util.Collection;
import java.text.Normalizer;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Firebase Test Lab smoke test: real demo ads, App Check token and Firebase AI image. */
@RunWith(AndroidJUnit4.class)
public final class FirebaseTestLabSmokeTest {
    private static final String TAG = "BdqTestLabSmoke";
    private static final String PACKAGE_NAME = "com.bomdiaqueridos.app";
    private static final String DEBUG_SECRET_ARGUMENT = "firebaseAppCheckDebugSecret";
    private static final String GOOGLE_DEMO_BANNER_UNIT = "ca-app-pub-3940256099942544/6300978111";
    private static final long UI_TIMEOUT_MS = TimeUnit.SECONDS.toMillis(45);
    private static final long GENERATION_TIMEOUT_MS = TimeUnit.MINUTES.toMillis(4);
    private static final AtomicBoolean testPluginInitializeCalled = new AtomicBoolean(false);
    private MainActivity currentActivity;

    @After
    public void finishActivityWithoutClearingAppData() {
        MainActivity activity = currentActivity;
        if (activity != null) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
            SystemClock.sleep(250);
            currentActivity = null;
        }
    }

    @Test
    public void firebaseAiGenerationUsesRealAppCheckAndPersistsImage() throws Exception {
        Bundle instrumentationArguments = InstrumentationRegistry.getArguments();
        String debugSecret = instrumentationArguments.getString(DEBUG_SECRET_ARGUMENT);
        assertTrue(
            "Pass firebaseAppCheckDebugSecret as a runtime Test Lab instrumentation argument.",
            debugSecret != null && !debugSecret.trim().isEmpty()
        );
        InternalDebugSecretProvider debugSecretProvider =
            FirebaseApp.getInstance().get(InternalDebugSecretProvider.class);
        assertNotNull(
            "Test-only App Check debug secret provider was not discovered from the debug app manifest.",
            debugSecretProvider
        );
        assertTrue(
            "App Check debug provider did not receive the runtime Test Lab instrumentation secret.",
            debugSecret.equals(debugSecretProvider.getDebugSecret())
        );
        // Do not log, copy into app arguments or persist the debug secret.
        testPluginInitializeCalled.set(false);

        DebugAppCheckTestHelper.fromInstrumentationArgs().withDebugProvider(() -> {
            AppCheckToken appCheckToken = Tasks.await(
                FirebaseAppCheck.getInstance(FirebaseApp.getInstance()).getAppCheckToken(false),
                30,
                TimeUnit.SECONDS
            );
            assertTrue(
                "Firebase App Check did not return a non-empty debug attestation token.",
                appCheckToken != null && appCheckToken.getToken() != null && !appCheckToken.getToken().trim().isEmpty()
            );
            Log.i(TAG, "APPCHECK_DEBUG_ATTESTATION_ACCEPTED");
            runFirebaseAiFlow();
        });

        assertTrue(
            "Firebase AI flow did not call the test-only App Check initialize override.",
            testPluginInitializeCalled.get()
        );
    }

    @Test
    public void demoBannerAndInterstitialAreReportedIndependently() throws Exception {
        MainActivity activity = launchApp(false);
        WebView webView = activity.getBridge().getWebView();
        assertNotNull("Capacitor WebView did not initialize.", webView);
        waitForJavascript(webView, "document.readyState === 'complete' && !!document.querySelector('.moment-card')", UI_TIMEOUT_MS);
        handleUmpConsentFormIfPresented(activity, TimeUnit.SECONDS.toMillis(15));

        assertTrue("Google demo banner did not load in the home view.", waitForLoadedBanner(activity, UI_TIMEOUT_MS));
        assertEquals("The banner request must use Google's demo test ad unit.", GOOGLE_DEMO_BANNER_UNIT, getLoadedBannerUnitId(activity));
        Log.i(TAG, "ADS_BANNER_LOADED; verified Google demo unit.");
        SystemClock.sleep(TimeUnit.SECONDS.toMillis(2));
        captureScreenshot("01-home-test-banner");

        // Keep this ad-only activity on afternoon so it does not consume the
        // morning image-generation quota used by the separate Firebase test.
        assertTrue("Could not open the afternoon moment.", click(webView, ".moment-grid .moment-card:nth-child(2)"));
        waitForJavascript(webView, "!!document.querySelector('.primary-actions button:nth-child(2)')", UI_TIMEOUT_MS);
        waitForGenerateButtonReady(webView, UI_TIMEOUT_MS);
        assertTrue("Could not request the ad-test local refresh.", click(webView, ".primary-actions button:nth-child(2)"));
        boolean interstitialSeen = waitForActionAndDismissInterstitial(webView, UI_TIMEOUT_MS, false);
        waitForGenerateButtonReady(webView, UI_TIMEOUT_MS);
        Log.i(TAG, interstitialSeen ? "ADS_INTERSTITIAL_SHOWN_AND_DISMISSED" : "ADS_INTERSTITIAL_NOT_SEEN");
        assertTrue("The demo interstitial was not shown; ads coverage remains incomplete.", interstitialSeen);
    }

    private void runFirebaseAiFlow() throws Exception {
        MainActivity activity = launchApp(true);
        Bridge bridge = activity.getBridge();
        assertNotNull("Capacitor bridge did not initialize.", bridge);
        assertNotNull("Test App Check plugin did not replace the native bridge handle.", bridge.getPlugin("FirebaseAppCheck"));
        assertEquals(TestFirebaseAppCheckPlugin.class, bridge.getPlugin("FirebaseAppCheck").getPluginClass());
        assertEquals(
            "getToken must stay inherited from the production Firebase App Check plugin.",
            FirebaseAppCheckPlugin.class,
            TestFirebaseAppCheckPlugin.class.getMethod("getToken", PluginCall.class).getDeclaringClass()
        );

        WebView webView = bridge.getWebView();
        assertNotNull("Capacitor WebView did not initialize.", webView);
        waitForJavascript(webView, "document.readyState === 'complete' && !!document.querySelector('.moment-card')", UI_TIMEOUT_MS);
        handleUmpConsentFormIfPresented(activity, TimeUnit.SECONDS.toMillis(15));
        if (waitForLoadedBanner(activity, TimeUnit.SECONDS.toMillis(8))) {
            Log.i(TAG, "AI_FLOW_BANNER_LOADED_AND_VISIBLE");
            SystemClock.sleep(TimeUnit.SECONDS.toMillis(2));
        } else {
            Log.i(TAG, "AI_FLOW_BANNER_NOT_LOADED; continuing Firebase verification.");
        }

        assertTrue("Could not open the morning moment.", click(webView, ".moment-grid .moment-card:first-child"));
        waitForJavascript(webView, "!!document.querySelector('.primary-actions button:nth-child(2)')", UI_TIMEOUT_MS);
        waitForGenerateButtonReady(webView, UI_TIMEOUT_MS);

        // The first manual refresh selects bundled artwork. The app's intended
        // flow then lets the next tap request a real Firebase AI image.
        assertTrue("Could not request the local refresh.", click(webView, ".primary-actions button:nth-child(2)"));
        boolean interstitialSeen = waitForActionAndDismissInterstitial(webView, UI_TIMEOUT_MS, false);
        waitForGenerateButtonReady(webView, UI_TIMEOUT_MS);
        startDatabaseProbe(webView, false);
        waitForJavascript(webView, "!!window.__bdqManualRefreshSaved", TimeUnit.SECONDS.toMillis(20));

        assertTrue("Could not request Firebase AI image generation.", click(webView, ".primary-actions button:nth-child(2)"));
        startDatabaseProbe(webView, true);
        long generationDeadline = SystemClock.elapsedRealtime() + GENERATION_TIMEOUT_MS;
        while (SystemClock.elapsedRealtime() < generationDeadline && !hasFirebaseImageSaved(webView)) {
            interstitialSeen |= waitForActionAndDismissInterstitial(webView, 800, true);
            SystemClock.sleep(400);
        }

        assertTrue("Firebase AI did not persist an image with source=firebase.", hasFirebaseImageSaved(webView));
        assertTrue("App Check debug-test initialize override was not called.", testPluginInitializeCalled.get());
        Log.i(TAG, "FIREBASE_AI_IMAGE_PERSISTED; App Check initialize override called; source=firebase.");
        if (interstitialSeen) {
            Log.i(TAG, "Firebase AI flow continued after the demo interstitial was dismissed by its close control.");
        } else {
            Log.w(TAG, "Firebase AI verification is continuing without an interstitial; the independent ads test reports its status.");
        }
        waitForJavascript(webView,
            "(() => { const image = document.querySelector('.message-art img'); return !!image && image.complete && image.naturalWidth > 0; })()",
            TimeUnit.SECONDS.toMillis(60)
        );
        SystemClock.sleep(TimeUnit.SECONDS.toMillis(2));
        captureScreenshot("03-firebase-ai-image");
    }

    private MainActivity launchApp(boolean registerTestAppCheckPlugin) throws Exception {
        Context targetContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent launchIntent = targetContext.getPackageManager().getLaunchIntentForPackage(PACKAGE_NAME);
        assertNotNull("App launch intent is missing.", launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        Application application = (Application) targetContext.getApplicationContext();
        AtomicReference<Throwable> registrationFailure = new AtomicReference<>();
        AtomicBoolean pluginRegisteredBeforeStart = new AtomicBoolean(false);
        if (registerTestAppCheckPlugin) {
            Application.ActivityLifecycleCallbacks callbacks = new Application.ActivityLifecycleCallbacks() {
                @Override
                public void onActivityCreated(Activity activity, Bundle savedInstanceState) {}

                @Override
                public void onActivityPostCreated(Activity activity, Bundle savedInstanceState) {
                    if (!(activity instanceof MainActivity)) return;
                    try {
                        // BridgeActivity creates its Bridge inside onCreate(); post-created runs after it,
                        // while the ActivityResultRegistry owner is still CREATED and before onStart.
                        Bridge bridge = ((MainActivity) activity).getBridge();
                        if (bridge == null) throw new IllegalStateException("Capacitor bridge missing after Activity.onCreate.");
                        bridge.registerPluginInstance(new TestFirebaseAppCheckPlugin());
                        pluginRegisteredBeforeStart.set(true);
                    } catch (Throwable error) {
                        registrationFailure.set(error);
                    } finally {
                        application.unregisterActivityLifecycleCallbacks(this);
                    }
                }

                @Override public void onActivityStarted(Activity activity) {}
                @Override public void onActivityResumed(Activity activity) {}
                @Override public void onActivityPaused(Activity activity) {}
                @Override public void onActivityStopped(Activity activity) {}
                @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
                @Override public void onActivityDestroyed(Activity activity) {}
            };
            application.registerActivityLifecycleCallbacks(callbacks);
        }

        Activity launched = InstrumentationRegistry.getInstrumentation().startActivitySync(launchIntent);
        assertTrue("Expected Capacitor MainActivity.", launched instanceof MainActivity);
        currentActivity = (MainActivity) launched;
        if (registerTestAppCheckPlugin) {
            assertTrue("Test plugin was not installed after Activity.onCreate and before onStart.", pluginRegisteredBeforeStart.get());
            assertEquals("Test plugin lifecycle registration failed.", null, registrationFailure.get());
            assertEquals(TestFirebaseAppCheckPlugin.class, currentActivity.getBridge().getPlugin("FirebaseAppCheck").getPluginClass());
            assertEquals(
                "getToken must stay inherited from the production Firebase App Check plugin.",
                FirebaseAppCheckPlugin.class,
                TestFirebaseAppCheckPlugin.class.getMethod("getToken", PluginCall.class).getDeclaringClass()
            );
        }
        return currentActivity;
    }

    private boolean waitForLoadedBanner(Activity activity, long timeoutMs) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        AtomicBoolean loaded = new AtomicBoolean(false);
        while (SystemClock.elapsedRealtime() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                loaded.set(findLoadedBanner(activity.getWindow().getDecorView()) != null)
            );
            if (loaded.get()) return true;
            SystemClock.sleep(500);
        }
        return false;
    }

    private static String getLoadedBannerUnitId(Activity activity) {
        AtomicReference<String> unitId = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            View banner = findLoadedBanner(activity.getWindow().getDecorView());
            if (banner != null) unitId.set(invokeStringMethod(banner, "getAdUnitId"));
        });
        return unitId.get();
    }

    private static View findLoadedBanner(View view) {
        if (view.getClass().getName().equals("com.google.android.gms.ads.AdView")) {
            Object responseInfo = invokeObjectMethod(view, "getResponseInfo");
            Object loadedAdapter = responseInfo == null ? null : invokeObjectMethod(responseInfo, "getLoadedAdapterResponseInfo");
            Rect visibleBounds = new Rect();
            boolean hasVisibleBounds = view.getGlobalVisibleRect(visibleBounds);
            boolean visible = view.isShown() && view.getAlpha() > 0f && view.getWidth() > 0 && view.getHeight() > 0 &&
                hasVisibleBounds && visibleBounds.width() > 0 && visibleBounds.height() > 0;
            return visible && loadedAdapter != null ? view : null;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                View found = findLoadedBanner(group.getChildAt(index));
                if (found != null) return found;
            }
        }
        return null;
    }

    private static String invokeStringMethod(View view, String methodName) {
        Object value = invokeObjectMethod(view, methodName);
        return value instanceof String ? (String) value : null;
    }

    private static Object invokeObjectMethod(Object target, String methodName) {
        try {
            return target.getClass().getMethod(methodName).invoke(target);
        } catch (ReflectiveOperationException error) {
            return null;
        }
    }

    private boolean waitForActionAndDismissInterstitial(WebView webView, long timeoutMs, boolean allowActionInFlight)
        throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        boolean interstitialSeen = false;
        while (SystemClock.elapsedRealtime() < deadline) {
            Activity adActivity = getResumedAdActivity();
            if (adActivity != null) {
                captureScreenshot("02-demo-interstitial");
                interstitialSeen = true;
                dismissInterstitialUsingCloseControl();
                continue;
            }
            if (!allowActionInFlight && isGenerateButtonReady(webView)) break;
            SystemClock.sleep(300);
        }
        return interstitialSeen;
    }

    private static void dismissInterstitialUsingCloseControl() throws Exception {
        long deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(60);
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        int tapAttempts = 0;
        while (SystemClock.elapsedRealtime() < deadline) {
            Activity adActivity = getResumedAdActivity();
            if (adActivity == null) return;

            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            Point screenSize = getRealScreenSize(adActivity);
            Rect targetBounds = root == null ? null :
                findSemanticCloseControlBounds(root, screenSize.x, screenSize.y);
            String targetType = "semantic-close";
            if (targetBounds == null && root != null) {
                targetBounds = findTopRightUnlabeledButtonBounds(root, screenSize.x, screenSize.y);
                targetType = "top-right-unlabeled-button";
            }

            if (targetBounds != null && tapBounds(automation, targetBounds)) {
                tapAttempts++;
                Log.i(TAG, "ADS_INTERSTITIAL_CLOSE_TAP; attempt=" + tapAttempts +
                    "; target=" + targetType + "; bounds=" + targetBounds.toShortString());
                // A video interstitial can expose a skip stage first and a
                // separate final X later; inspect the tree again after every tap.
                SystemClock.sleep(TimeUnit.SECONDS.toMillis(1));
                continue;
            }
            SystemClock.sleep(300);
        }
        Log.w(TAG, "ADS_INTERSTITIAL_CLOSE_TIMEOUT; taps=" + tapAttempts +
            "; candidates=" + getSafeCloseCandidateSummary());
        assertTrue(
            "The interstitial remained open after repeated attempts on permitted close controls.",
            getResumedAdActivity() == null
        );
    }

    private static Point getRealScreenSize(Activity activity) {
        Point size = new Point();
        activity.getWindowManager().getDefaultDisplay().getRealSize(size);
        return size;
    }

    /** Declines only the consent form's explicit opt-out action, when the form appears. */
    private static boolean handleUmpConsentFormIfPresented(Activity activity, long timeoutMs) {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        Point screenSize = getRealScreenSize(activity);
        String lastControlKey = "";
        long lastTapAt = 0;
        int tapAttempts = 0;
        boolean declineControlSeen = false;
        while (SystemClock.elapsedRealtime() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            Rect targetBounds = root == null ? null :
                findUmpDeclineControlBounds(root, screenSize.x, screenSize.y);
            if (targetBounds != null) {
                declineControlSeen = true;
                String controlKey = "exact-ump-decline";
                long now = SystemClock.elapsedRealtime();
                if (!controlKey.equals(lastControlKey) || now - lastTapAt >= TimeUnit.SECONDS.toMillis(1)) {
                    boolean injected = tapBounds(automation, targetBounds);
                    tapAttempts++;
                    Log.i(TAG, "UMP_FORM_DECLINE_TAP; attempt=" + tapAttempts +
                        "; injected=" + injected + "; bounds=" + targetBounds.toShortString());
                    lastControlKey = controlKey;
                    lastTapAt = now;
                }
            } else if (declineControlSeen) {
                Log.i(TAG, "UMP_FORM_DECLINE_CONTROL_DISAPPEARED; taps=" + tapAttempts);
                return true;
            }
            SystemClock.sleep(250);
        }
        if (declineControlSeen) {
            Log.w(TAG, "UMP_FORM_DECLINE_TIMEOUT; taps=" + tapAttempts);
            assertTrue("The UMP decline control remained on screen after real touch attempts.", false);
        }
        Log.i(TAG, "UMP_CONSENT_FORM_NOT_PRESENT; continuing without interaction.");
        return false;
    }

    private static Rect findUmpDeclineControlBounds(AccessibilityNodeInfo node, int screenWidth, int screenHeight) {
        if (isExactUmpDeclineControl(node) && node.isEnabled() && node.isVisibleToUser()) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            if (isSafeUmpDeclineBounds(bounds, screenWidth, screenHeight)) return bounds;

            AccessibilityNodeInfo ancestor = node.getParent();
            for (int depth = 0; ancestor != null && depth < 4; depth++) {
                CharSequence rawClass = ancestor.getClassName();
                String className = rawClass == null ? "" : rawClass.toString();
                boolean buttonClass = className.endsWith("Button");
                if (buttonClass && ancestor.isEnabled() && ancestor.isVisibleToUser() && ancestor.isClickable()) {
                    Rect ancestorBounds = new Rect();
                    ancestor.getBoundsInScreen(ancestorBounds);
                    if (isSafeUmpDeclineBounds(ancestorBounds, screenWidth, screenHeight)) return ancestorBounds;
                }
                ancestor = ancestor.getParent();
            }
        }
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) {
                Rect bounds = findUmpDeclineControlBounds(child, screenWidth, screenHeight);
                if (bounds != null) return bounds;
            }
        }
        return null;
    }

    private static boolean isSafeUmpDeclineBounds(Rect bounds, int screenWidth, int screenHeight) {
        if (bounds == null || bounds.isEmpty() || screenWidth <= 0 || screenHeight <= 0 ||
            bounds.left < 0 || bounds.top < 0 || bounds.right > screenWidth || bounds.bottom > screenHeight ||
            bounds.height() > (screenHeight * 15 / 100)) {
            return false;
        }
        long boundsArea = (long) bounds.width() * bounds.height();
        long screenArea = (long) screenWidth * screenHeight;
        return boundsArea <= (screenArea * 20 / 100);
    }

    private static boolean isExactUmpDeclineControl(AccessibilityNodeInfo node) {
        return isExactUmpDeclineText(normalizeAccessibilityText(node.getText())) ||
            isExactUmpDeclineText(normalizeAccessibilityText(node.getContentDescription()));
    }

    private static boolean isExactUmpDeclineText(String value) {
        return value.equals("nao consentir") || value.equals("do not consent");
    }

    private static Rect findSemanticCloseControlBounds(AccessibilityNodeInfo node, int screenWidth, int screenHeight) {
        if (isSemanticCloseControl(node) && node.isEnabled() && node.isVisibleToUser()) {
            AccessibilityNodeInfo clickable = node;
            for (int ancestorDepth = 0; clickable != null && ancestorDepth <= 4; ancestorDepth++) {
                if (clickable.isEnabled() && clickable.isVisibleToUser() && clickable.isClickable()) {
                    Rect bounds = new Rect();
                    clickable.getBoundsInScreen(bounds);
                    if (isSafeTopRightCloseBounds(bounds, screenWidth, screenHeight)) return bounds;
                }
                clickable = clickable.getParent();
            }
        }
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) {
                Rect bounds = findSemanticCloseControlBounds(child, screenWidth, screenHeight);
                if (bounds != null) return bounds;
            }
        }
        return null;
    }

    private static Rect findTopRightUnlabeledButtonBounds(AccessibilityNodeInfo node, int screenWidth, int screenHeight) {
        CharSequence rawClass = node.getClassName();
        String className = rawClass == null ? "" : rawClass.toString();
        boolean unlabeled = normalizeAccessibilityText(node.getText()).isEmpty() &&
            normalizeAccessibilityText(node.getContentDescription()).isEmpty();
        if (className.equals("android.widget.Button") && unlabeled && node.isEnabled() &&
            node.isVisibleToUser() && node.isClickable()) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            if (isSafeTopRightCloseBounds(bounds, screenWidth, screenHeight)) return bounds;
        }
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) {
                Rect bounds = findTopRightUnlabeledButtonBounds(child, screenWidth, screenHeight);
                if (bounds != null) return bounds;
            }
        }
        return null;
    }

    private static boolean isSafeTopRightCloseBounds(Rect bounds, int screenWidth, int screenHeight) {
        return bounds != null && !bounds.isEmpty() && screenWidth > 0 && screenHeight > 0 &&
            bounds.left >= (screenWidth * 3 / 4) && bounds.top >= 0 &&
            bounds.top <= (screenHeight * 15 / 100) && bounds.right <= screenWidth &&
            bounds.bottom <= screenHeight && bounds.width() <= (screenWidth / 5) &&
            bounds.height() <= (screenHeight / 10);
    }

    private static boolean tapBounds(UiAutomation automation, Rect bounds) {
        if (bounds == null || bounds.isEmpty()) return false;
        float x = bounds.exactCenterX();
        float y = bounds.exactCenterY();
        long downTime = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(
            downTime,
            downTime + 80,
            MotionEvent.ACTION_UP,
            x,
            y,
            0
        );
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            boolean downInjected = automation.injectInputEvent(down, true);
            SystemClock.sleep(80);
            boolean upInjected = automation.injectInputEvent(up, true);
            return downInjected && upInjected;
        } finally {
            down.recycle();
            up.recycle();
        }
    }

    private static boolean isSemanticCloseControl(AccessibilityNodeInfo node) {
        String description = normalizeAccessibilityText(node.getContentDescription());
        String text = normalizeAccessibilityText(node.getText());
        String resourceId = node.getViewIdResourceName();
        String normalizedId = resourceId == null ? "" : resourceId.toLowerCase(Locale.ROOT);
        return isCloseLabel(description) || isCloseLabel(text) ||
            normalizedId.endsWith("/close_button") || normalizedId.endsWith("/ad_close_button") ||
            normalizedId.endsWith(":id/close") || normalizedId.endsWith(":id/ad_close");
    }

    private static boolean isCloseLabel(String value) {
        return value.equals("close") || value.equals("close ad") || value.equals("dismiss") ||
            value.equals("close button") || value.equals("close interstitial") || value.equals("close interstitial ad") ||
            value.equals("interstitial close button") || value.equals("dismiss interstitial") || value.equals("skip") ||
            value.equals("skip ad") || value.equals("skip interstitial") || value.equals("fechar") ||
            value.equals("fechar anuncio") || value.equals("fechar anuncio intersticial") || value.equals("pular") ||
            value.equals("pular anuncio");
    }

    private static String getSafeCloseCandidateSummary() {
        UiAutomation automation = InstrumentationRegistry.getInstrumentation().getUiAutomation();
        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        if (root == null) return "none (no active accessibility root)";
        java.util.ArrayList<String> candidates = new java.util.ArrayList<>();
        collectSafeCloseCandidates(root, candidates);
        return candidates.isEmpty() ? "none" : candidates.toString();
    }

    private static void collectSafeCloseCandidates(AccessibilityNodeInfo node, java.util.List<String> candidates) {
        if (candidates.size() < 8) {
            CharSequence rawClass = node.getClassName();
            String className = rawClass == null ? "unknown" : rawClass.toString();
            String resourceId = node.getViewIdResourceName();
            String normalizedId = resourceId == null ? "" : resourceId.toLowerCase(Locale.ROOT);
            String description = normalizeAccessibilityText(node.getContentDescription());
            boolean buttonClass = className.endsWith("Button") || className.endsWith("ImageButton");
            boolean closeResource = normalizedId.contains("close") || normalizedId.contains("dismiss") || normalizedId.contains("skip");
            if (buttonClass || closeResource || isCloseLabel(description)) {
                String safeId = closeResource ? resourceId : "";
                String safeLabel = isCloseLabel(description) ? description : "";
                candidates.add("class=" + className + ",id=" + safeId + ",label=" + safeLabel +
                    ",clickable=" + node.isClickable() + ",enabled=" + node.isEnabled());
            }
        }
        for (int index = 0; index < node.getChildCount() && candidates.size() < 8; index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null) collectSafeCloseCandidates(child, candidates);
        }
    }

    private static String normalizeAccessibilityText(CharSequence value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .trim()
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ");
    }

    private static Activity getResumedAdActivity() {
        AtomicReference<Activity> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Collection<Activity> resumed = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED);
            for (Activity activity : resumed) {
                String className = activity.getClass().getName();
                if (className.equals("com.google.android.gms.ads.AdActivity") || className.endsWith(".ads.AdActivity")) {
                    result.set(activity);
                    return;
                }
            }
        });
        return result.get();
    }

    private static void waitForGenerateButtonReady(WebView webView, long timeoutMs) throws Exception {
        waitUntil(() -> isGenerateButtonReady(webView), timeoutMs, "Generate button did not become ready.");
    }

    private static boolean isGenerateButtonReady(WebView webView) throws Exception {
        return evaluateBoolean(webView,
            "(() => { const b = document.querySelector('.primary-actions button:nth-child(2)'); " +
            "return !!b && !b.disabled && b.getAttribute('aria-busy') !== 'true'; })()"
        );
    }

    private static boolean click(WebView webView, String selector) throws Exception {
        String escapedSelector = selector.replace("\\", "\\\\").replace("'", "\\'");
        return evaluateBoolean(webView,
            "(() => { const e = document.querySelector('" + escapedSelector + "'); " +
            "if (!e || e.disabled) return false; e.click(); return true; })()"
        );
    }

    private static boolean hasFirebaseImageSaved(WebView webView) throws Exception {
        return evaluateBoolean(webView, "!!window.__bdqFirebaseImageSaved");
    }

    private static void startDatabaseProbe(WebView webView, boolean firebaseImage) throws Exception {
        String flag = firebaseImage ? "__bdqFirebaseImageSaved" : "__bdqManualRefreshSaved";
        String condition = firebaseImage
            ? "entry.message.source === 'firebase' && typeof entry.message.image === 'string' && " +
                "entry.message.image.startsWith('data:image/') && entry.message.image.length > 2000"
            : "entry.message.generationFlow && entry.message.generationFlow.manualBankRefreshes >= 1";
        String probe = "(() => { window." + flag + " = false; (async () => { " +
            "const end = Date.now() + " + (firebaseImage ? GENERATION_TIMEOUT_MS : TimeUnit.SECONDS.toMillis(20)) + "; " +
            "while (Date.now() < end && !window." + flag + ") { " +
            "try { const db = await new Promise((resolve, reject) => { const r = indexedDB.open('bdq_daily_messages.v1', 1); " +
            "r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('periods')) r.result.createObjectStore('periods'); }; " +
            "r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); " +
            "const rows = await new Promise((resolve, reject) => { const r = db.transaction('periods').objectStore('periods').getAll(); " +
            "r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); " +
            "db.close(); window." + flag + " = rows.some(entry => entry && entry.message && entry.message.periodId === 'morning' && " + condition + "); " +
            "} catch (_) { } " +
            "if (!window." + flag + ") await new Promise(resolve => setTimeout(resolve, 500)); " +
            "} })(); return true; })()";
        assertTrue("Could not start the IndexedDB verification probe.", evaluateBoolean(webView, probe));
    }

    private static boolean evaluateBoolean(WebView webView, String expression) throws Exception {
        return "true".equals(evaluate(webView, expression));
    }

    private static String evaluate(WebView webView, String expression) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            webView.evaluateJavascript(expression, value -> {
                result.set(value);
                completed.countDown();
            })
        );
        assertTrue("WebView JavaScript evaluation timed out.", completed.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private static void waitForJavascript(WebView webView, String expression, long timeoutMs) throws Exception {
        waitUntil(() -> evaluateBoolean(webView, expression), timeoutMs, "Expected WebView element was not ready.");
    }

    private static void waitUntil(CheckedCondition condition, long timeoutMs, String failureMessage) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (condition.isTrue()) return;
            SystemClock.sleep(300);
        }
        assertTrue(failureMessage, condition.isTrue());
    }

    private static void captureScreenshot(String name) {
        try {
            Screenshot.capture().setName(name).setFormat(android.graphics.Bitmap.CompressFormat.JPEG).process();
        } catch (Exception error) {
            // FTL's screenshot processor is best-effort on newer scoped-storage devices.
            Log.w(TAG, "Screenshot unavailable: " + error.getClass().getSimpleName());
        }
    }

    @FunctionalInterface
    private interface CheckedCondition {
        boolean isTrue() throws Exception;
    }

    /** Replaces only initialize(); getToken() stays the real plugin implementation. */
    @com.getcapacitor.annotation.CapacitorPlugin(name = "FirebaseAppCheck")
    public static final class TestFirebaseAppCheckPlugin extends FirebaseAppCheckPlugin {
        @Override
        @PluginMethod
        public void initialize(PluginCall call) {
            testPluginInitializeCalled.set(true);
            call.resolve();
        }
    }
}
