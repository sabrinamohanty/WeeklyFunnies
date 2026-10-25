import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ThemedBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}


/// Keeps the native layer behind the web page in step with the app's theme. The status bar's fade takes its tint
/// from this layer, so a fixed light background made it look washed out over the dark paper.
final class ThemedBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private static let paper = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x17 / 255, green: 0x14 / 255, blue: 0x0F / 255, alpha: 1)
            : UIColor(red: 0xF3 / 255, green: 0xEF / 255, blue: 0xE4 / 255, alpha: 1)
    }

    override func capacitorDidLoad() {
        view.backgroundColor = Self.paper
        webView?.isOpaque = false
        webView?.backgroundColor = Self.paper
        webView?.scrollView.backgroundColor = Self.paper
        webView?.underPageBackgroundColor = Self.paper
        // The page reports its theme ("light", "dark" or "system") so the in-app Day/Night setting wins over the phone's.
        webView?.configuration.userContentController.add(self, name: "theme")
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let mode = message.body as? String else { return }
        switch mode {
        case "dark": overrideUserInterfaceStyle = .dark
        case "light": overrideUserInterfaceStyle = .light
        default: overrideUserInterfaceStyle = .unspecified
        }
    }
}
