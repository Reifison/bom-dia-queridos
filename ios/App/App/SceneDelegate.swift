import UIKit
import Capacitor
import WebKit
import AppTrackingTransparency
import UserMessagingPlatform

/// ATT must run while active, before the ads SDK or a regional UMP form.
@objc(TrackingConsentPlugin)
final class TrackingConsentPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "TrackingConsentPlugin"
    let jsName = "TrackingConsent"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestConsentInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentConsentForm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentPrivacyOptionsForm", returnType: CAPPluginReturnPromise)
    ]

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.requestWhenActive(call, deadline: Date().addingTimeInterval(30))
        }
    }

    @objc func requestConsentInfo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let parameters = RequestParameters()
            parameters.isTaggedForUnderAgeOfConsent = false
            ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { error in
                if let error = error {
                    let nativeError = error as NSError
                    #if DEBUG
                    print("[UMP] \(nativeError.domain) \(nativeError.code): \(nativeError.localizedDescription)")
                    #endif
                    call.reject("Consent information unavailable", "UMP_\(nativeError.code)")
                    return
                }
                let info = ConsentInformation.shared
                let status: String
                switch info.consentStatus {
                case .required: status = "REQUIRED"
                case .notRequired: status = "NOT_REQUIRED"
                case .obtained: status = "OBTAINED"
                default: status = "UNKNOWN"
                }
                call.resolve([
                    "status": status,
                    "isConsentFormAvailable": info.formStatus == .available,
                    "canRequestAds": info.canRequestAds,
                    "privacyOptionsRequirementStatus": info.privacyOptionsRequirementStatus == .required ? "REQUIRED" : "NOT_REQUIRED"
                ])
            }
        }
    }

    /// The AdMob plugin binds its UMP presenter only during SDK startup.
    /// Present UMP directly so consent does not require starting MobileAds.
    @objc func presentConsentForm(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.presentConsentWhenActive(call, deadline: Date().addingTimeInterval(30))
        }
    }

    @objc func presentPrivacyOptionsForm(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.presentConsentWhenActive(call, deadline: Date().addingTimeInterval(30), privacyOptions: true)
        }
    }

    private func presentConsentWhenActive(_ call: CAPPluginCall, deadline: Date, privacyOptions: Bool = false) {
        guard Date() < deadline else {
            call.reject("Consent presentation deferred", "CONSENT_DEFERRED")
            return
        }
        guard UIApplication.shared.applicationState == .active,
              let presenter = bridge?.viewController,
              presenter.view.window != nil,
              presenter.presentedViewController == nil else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                self.presentConsentWhenActive(call, deadline: deadline, privacyOptions: privacyOptions)
            }
            return
        }
        Task { @MainActor in
            do {
                if privacyOptions {
                    try await ConsentForm.presentPrivacyOptionsForm(from: presenter)
                } else {
                    try await ConsentForm.loadAndPresentIfRequired(from: presenter)
                }
                let info = ConsentInformation.shared
                let status: String
                switch info.consentStatus {
                case .required: status = "REQUIRED"
                case .notRequired: status = "NOT_REQUIRED"
                case .obtained: status = "OBTAINED"
                default: status = "UNKNOWN"
                }
                call.resolve([
                    "status": status,
                    "canRequestAds": info.canRequestAds,
                    "privacyOptionsRequirementStatus": info.privacyOptionsRequirementStatus == .required ? "REQUIRED" : "NOT_REQUIRED"
                ])
            } catch {
                call.reject("Consent form failed", "CONSENT_FAILED")
            }
        }
    }

    private func requestWhenActive(_ call: CAPPluginCall, deadline: Date) {
        let status = ATTrackingManager.trackingAuthorizationStatus
        guard status == .notDetermined else {
            call.resolve(["status": status.rawValue])
            return
        }
        guard Date() < deadline else {
            call.reject("ATT presentation deferred; ads remain disabled", "ATT_DEFERRED")
            return
        }
        guard UIApplication.shared.applicationState == .active,
              bridge?.viewController?.view.window != nil,
              bridge?.viewController?.presentedViewController == nil else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                self.requestWhenActive(call, deadline: deadline)
            }
            return
        }
        ATTrackingManager.requestTrackingAuthorization { result in
            DispatchQueue.main.async {
                guard result != .notDetermined else {
                    call.reject("ATT has not completed; ads remain disabled", "ATT_DEFERRED")
                    return
                }
                call.resolve(["status": result.rawValue])
            }
        }
    }
}

private struct DuoLayoutRegion: Codable, Equatable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let kind: String
}

private struct DuoLayout: Codable, Equatable {
    let width: Double
    let height: Double
    let regions: [DuoLayoutRegion]
}

/// Reading reserved regions during updateConstraints makes UIKit invalidate
/// this view again when a region becomes active or inactive.
private final class DuoAwareWebView: WKWebView {
    var layoutMayHaveChanged: (() -> Void)?
    private var loadingObservation: NSKeyValueObservation?

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        loadingObservation = observe(\.isLoading, options: [.new]) { [weak self] _, change in
            DispatchQueue.main.async { [weak self] in
                self?.layoutMayHaveChanged?()
            }
        }
    }

    required init?(coder: NSCoder) {
        fatalError("DuoAwareWebView is created by Capacitor with a WKWebViewConfiguration")
    }

    override func updateConstraints() {
        if #available(iOS 27.1, *) {
            _ = reservedRegions(kind: .division)
            _ = reservedRegions(kind: .occlusion)
        }
        super.updateConstraints()
        layoutMayHaveChanged?()
    }
}

private final class DuoCapBridgeViewController: CAPBridgeViewController {
    private var lastPublishedLayout: DuoLayout?
    private var publishScheduled = false

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TrackingConsentPlugin())
    }

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        // Publish the native app language before the web bundle executes. This
        // honors Settings > Apps > Language as well as the device preferences.
        let locale = Bundle.main.preferredLocalizations.first?.hasPrefix("pt") == true ? "pt" : "en"
        configuration.userContentController.addUserScript(WKUserScript(
            source: "window.__appLocale = '\(locale)';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let webView = DuoAwareWebView(frame: frame, configuration: configuration)
        webView.layoutMayHaveChanged = { [weak self, weak webView] in
            if webView?.isLoading == true {
                self?.lastPublishedLayout = nil
                return
            }
            self?.scheduleLayoutPublication()
        }
        return webView
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        scheduleLayoutPublication()
    }

    private func scheduleLayoutPublication() {
        guard !publishScheduled else { return }
        publishScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.publishScheduled = false
            self.publishLayoutIfChanged()
        }
    }

    private func publishLayoutIfChanged() {
        guard let webView = webView as? DuoAwareWebView,
              webView.url != nil,
              !webView.isLoading else { return }

        let insets = webView.scrollView.adjustedContentInset
        let viewport = webView.bounds.inset(by: insets)
        let viewportWidth = max(0, viewport.width)
        let viewportHeight = max(0, viewport.height)
        var regions: [DuoLayoutRegion] = []

        if #available(iOS 27.1, *) {
            for (kind, name) in [(UIView.ReservedRegion.Kind.division, "division"),
                                 (.occlusion, "occlusion")] {
                for region in webView.reservedRegions(kind: kind) {
                    let visibleFrame = region.frame.intersection(viewport)
                    guard !visibleFrame.isNull,
                          visibleFrame.minX.isFinite, visibleFrame.minY.isFinite,
                          visibleFrame.width.isFinite, visibleFrame.height.isFinite else { continue }
                    regions.append(DuoLayoutRegion(
                        x: Double(visibleFrame.minX - viewport.minX),
                        y: Double(visibleFrame.minY - viewport.minY),
                        width: Double(visibleFrame.width),
                        height: Double(visibleFrame.height),
                        kind: name
                    ))
                }
            }
        }

        let layout = DuoLayout(
            width: Double(viewportWidth),
            height: Double(viewportHeight),
            regions: regions
        )
        guard layout != lastPublishedLayout,
              let data = try? JSONEncoder().encode(layout),
              let json = String(data: data, encoding: .utf8) else { return }
        lastPublishedLayout = layout

        let script = "window.__duoLayout = \(json); window.dispatchEvent(new CustomEvent('duolayoutchange', { detail: window.__duoLayout }));"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func sceneDidBecomeActive(_ scene: UIScene) {
        (window?.rootViewController as? CAPBridgeViewController)?.webView?.evaluateJavaScript(
            "window.dispatchEvent(new Event('adprivacyresume'));", completionHandler: nil
        )
    }

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = DuoCapBridgeViewController()
        window.makeKeyAndVisible()
        self.window = window

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
