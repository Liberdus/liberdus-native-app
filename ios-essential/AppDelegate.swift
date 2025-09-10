import Expo
import React
import ReactAppDependencyProvider
import PushKit

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate, PKPushRegistryDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NSLog("🚀 My custom AppDelegate.swift is being used")
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
    
    // Register VoIP push notifications ASAP as recommended by react-native-voip-push-notification
    RNVoipPushNotificationManager.voipRegistration()
    
    // Set this AppDelegate as the PKPushRegistry delegate
    let pushRegistry = PKPushRegistry(queue: DispatchQueue.main)
    pushRegistry.delegate = self
    pushRegistry.desiredPushTypes = [.voIP]
    NSLog("[AppDelegate] ✅ PKPushRegistry delegate set and VoIP type registered")

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }

  // MARK: - PKPushRegistryDelegate (Required by react-native-voip-push-notification)
  
  // Handle updated push credentials
  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    NSLog("[AppDelegate] ✅ VoIP push credentials updated for type: \(type.rawValue)")
    let tokenString = pushCredentials.token.map { String(format: "%02hhx", $0) }.joined()
    NSLog("[AppDelegate] VoIP token: \(tokenString)")
    // Register VoIP push token with react-native-voip-push-notification
    RNVoipPushNotificationManager.didUpdate(pushCredentials, forType: type.rawValue)
  }
  
  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    NSLog("[AppDelegate] ⚠️ VoIP push token invalidated for type: \(type.rawValue)")
    // The system calls this method when a previously provided push token is no longer valid for use.
    // No action is necessary on your part to reregister the push type.
    // Instead, use this method to notify your server not to send push notifications using the matching push token.
  }
  
  // Handle incoming pushes
  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    NSLog("[AppDelegate] VoIP push received when app state: \(UIApplication.shared.applicationState.rawValue)")
    NSLog("[AppDelegate] VoIP payload: \(payload.dictionaryPayload)")
    
    // Don't call completion immediately - let React Native handle it
    // completion() will be called by RNVoipPushNotificationManager.addCompletionHandler
    
    // Retrieve information from your VoIP push payload
    let payloadDict = payload.dictionaryPayload
    let uuid = payloadDict["callId"] as? String ?? payloadDict["callUUID"] as? String ?? UUID().uuidString
    let callerName = payloadDict["callerName"] as? String ?? payloadDict["from"] as? String ?? "Unknown Caller"
    let handle = payloadDict["handle"] as? String ?? callerName
    
    NSLog("[AppDelegate] Processing VoIP call - UUID: \(uuid), Caller: \(callerName)")
    
    // CRITICAL: For killed app scenarios, we MUST call CallKit immediately
    // Apple requires this for VoIP pushes to work when app is killed
    let appState = UIApplication.shared.applicationState
    if appState != .active {
      NSLog("[AppDelegate] App not active (state: \(appState.rawValue)) - reporting to CallKit immediately")
      
      do {
        RNCallKeep.reportNewIncomingCall(
          uuid,
          handle: handle,
          handleType: "generic",
          hasVideo: true,
          localizedCallerName: callerName,
          supportsHolding: true,
          supportsDTMF: true,
          supportsGrouping: true,
          supportsUngrouping: true,
          fromPushKit: true,
          payload: nil,
          withCompletionHandler: completion
        )
        NSLog("[AppDelegate] ✅ CallKit reported for killed/background state")
      } catch let error as NSError {
        NSLog("[AppDelegate] ❌ CallKit error: \(error.localizedDescription)")
        NSLog("[AppDelegate] ❌ CallKit error domain: \(error.domain), code: \(error.code)")
        // Don't rethrow - continue with VoIP processing
      } catch {
        NSLog("[AppDelegate] ❌ CallKit unexpected error: \(error)")
      }
    }
    
    // Forward to React Native for active app handling
    RNVoipPushNotificationManager.didReceiveIncomingPush(with: payload, forType: type.rawValue)
    NSLog("[AppDelegate] ✅ VoIP push forwarded to React Native")
    
    // Only add completion handler if we didn't already pass it to CallKit
    if appState == .active {
      RNVoipPushNotificationManager.addCompletionHandler(uuid, completionHandler: {
        completion()
      })
    }
    NSLog("[AppDelegate] ✅ Completion handler added for UUID: \(uuid)")
  }
  

}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
