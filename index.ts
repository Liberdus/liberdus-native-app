import { registerRootComponent } from "expo";
import { NativeModules, Platform } from "react-native";
import {
  getMessaging,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";
import RNCallKeep from "react-native-callkeep";
import uuid from "react-native-uuid";
import App from "./App";
import { callKeepOptions } from "./CallKeepService";

// Background message handler for Firebase (when app is killed or backgrounded)
// This must be set at module level, outside of any component
if (Platform.OS == "android") {
  console.log("🔧 Setting up Firebase background message handler...");
  try {
    const messagingInstance = getMessaging();
    setBackgroundMessageHandler(
      messagingInstance,
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.log("📱 FCM background message received:", remoteMessage);

        // Handle high priority data messages for calls
        if (remoteMessage.data) {
          const isCallMessage = remoteMessage.data.type === "incoming_call";

          if (isCallMessage) {
            console.log("📞 Processing call message in background handler");

            const callerName =
              remoteMessage.data.callerName || "Unknown Caller";
            const callUUID = remoteMessage.data.callId || (uuid.v4() as string);

            console.log(
              `📞 Background: Processing call from ${callerName} (${callUUID})`
            );

            try {
              console.log(
                "🔄 Background: Attempting native displayIncomingCall"
              );

              const RNCallKeepModule = NativeModules.RNCallKeep;

              if (RNCallKeepModule && RNCallKeepModule.displayIncomingCall) {
                console.log(
                  "📞 Background: Using native displayIncomingCall with proper setup"
                );

                // Set up CallKeep with proper configuration
                try {
                  console.log(
                    "🔧 Background: Setting up CallKeep for event handling"
                  );
                  RNCallKeep.setup(callKeepOptions);

                  // Register event handlers
                  RNCallKeep.addEventListener(
                    "answerCall",
                    ({ callUUID }: { callUUID: string }) => {
                      console.log(
                        "📞 Background: Call answered event received:",
                        callUUID
                      );

                      try {
                        console.log(
                          "🚀 Background: Bringing app to foreground"
                        );
                        RNCallKeep.backToForeground();

                        console.log("📞 Background: Ending call immediately");
                        RNCallKeep.endCall(callUUID);
                        console.log("✅ Background: Call ended successfully");
                      } catch (endError) {
                        console.log(
                          "⚠️ Background: Call end failed, trying endAllCalls:",
                          endError
                        );

                        try {
                          RNCallKeep.endAllCalls();
                          console.log("✅ Background: endAllCalls successful");
                        } catch (allError) {
                          console.log(
                            "❌ Background: endAllCalls failed:",
                            allError
                          );
                        }
                      }
                    }
                  );

                  RNCallKeep.addEventListener(
                    "endCall",
                    ({ callUUID }: { callUUID: string }) => {
                      console.log(
                        "📞 Background: Call ended event received:",
                        callUUID
                      );
                    }
                  );

                  console.log(
                    "✅ Background: CallKeep event handlers registered"
                  );
                } catch (setupError) {
                  console.log(
                    "⚠️ Background: CallKeep setup failed:",
                    setupError
                  );
                }

                // Display the incoming call
                RNCallKeepModule.displayIncomingCall(
                  callUUID,
                  callerName,
                  callerName,
                  false
                );
                console.log(
                  "✅ Background: Native displayIncomingCall successful"
                );
              } else {
                console.error(
                  "❌ Background: RNCallKeep native module not available"
                );
              }
            } catch (error) {
              console.error(
                "❌ Background: Failed to display incoming call:",
                error
              );
            }
          } else {
            console.log("📱 Background: Non-call message, ignoring");
          }
        } else {
          console.log("📱 Background: No data in message");
        }
      }
    );
    console.log("✅ Firebase messaging background handler set up successfully");
  } catch (error) {
    console.warn(
      "⚠️ Firebase not initialized yet, background handler will be set up later:",
      error
    );
  }
}

// registerRootComponent calls AppRegistry.registerComponent('YourAppName', () => App);
// It also ensures that whether you load the app in Expo Go or in a standalone app,
// the environment is set up appropriately
registerRootComponent(App);
