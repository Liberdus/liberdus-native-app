import { registerRootComponent } from "expo";
import { NativeModules, Platform } from "react-native";
import {
  getMessaging,
  setBackgroundMessageHandler,
} from "@react-native-firebase/messaging";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";
import App from "./App";
import { CallData, callKeepOptions } from "./CallKeepService";
import RNCallKeep from "react-native-callkeep";

// Global map to track processed messages
const processedMessages = new Set<string>();

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
        if (!remoteMessage.data) {
          console.log("📱 Background: No data in message, ignoring");
          return;
        }
        const isCallMessage = remoteMessage.data?.type === "incoming_call";

        if (!isCallMessage) {
          console.log("📱 Background: Non-call message, ignoring");
          return;
        }

        console.log('Processed messages:', processedMessages);

        // Check for duplicate messages using messageId
        const messageId = remoteMessage.messageId;
        if (messageId) {
          if (processedMessages.has(messageId)) {
            console.log(
              `📱 Background: Message ${messageId} already processed, ignoring`
            );
            return;
          }

          // Mark message as processed
          processedMessages.add(messageId);
          console.log(
            `📱 Background: Marked message ${messageId} as processed`
          );
        }

        try {
          const callData = remoteMessage.data as unknown as CallData;
          const callerName = callData.callerName || "Unknown Caller";
          const callUUID = callData.callId as string;

          // // Display call using callKeepService [ NOT WORKING ]
          // try {
          //   CallKeepService.setup("background");
          //   CallKeepService.handleIncomingCall(callData);
          //   console.log("✅ Call displayed successfully via CallKeepService");
          //   return;
          // } catch (error) {
          //   console.error(
          //     "❌ Failed to display incoming call via CallKeepService:",
          //     error
          //   );
          // }

          console.log(
            `📞 Background: Processing call from ${callerName} (${callUUID})`
          );

          // Attempt to display call using native module
          try {
            console.log("🔄 Background: Attempting native displayIncomingCall");

            const RNCallKeepModule = NativeModules.RNCallKeep;

            if (RNCallKeepModule && RNCallKeepModule.displayIncomingCall) {
              // Setup RNCallKeep [ THIS HELPS IN BRINGING APP TO FOREGROUND WHEN CALL ANSWERED ]
              RNCallKeep.setup(callKeepOptions);
              RNCallKeep.setAvailable(true);

              // Register event handlers
              const answerCallHandler = ({
                callUUID,
              }: {
                callUUID: string;
              }) => {
                console.log(
                  "📞 Background: Call answered event received:",
                  callUUID
                );

                try {
                  console.log("🚀 Background: Bringing app to foreground");
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
                    console.log("❌ Background: endAllCalls failed:", allError);
                  }
                }
              };

              const endCallHandler = ({ callUUID }: { callUUID: string }) => {
                console.log(
                  "📞 Background: Call ended event received:",
                  callUUID
                );

                cleanUpRNCallKeepHandlers();
              };

              RNCallKeep.addEventListener("answerCall", answerCallHandler);
              RNCallKeep.addEventListener("endCall", endCallHandler);

              const cleanUpRNCallKeepHandlers = () => {
                // Cleanup event listeners after call is handled
                RNCallKeep.removeEventListener("answerCall");
                RNCallKeep.removeEventListener("endCall");
                console.log("🧹 Background: Event listeners cleaned up");
              };

              console.log("✅ Background: CallKeep event handlers registered");

              // Use native module to display call (works in background)
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
              "❌ Background: Failed to display incoming call via native module:",
              error
            );
          }
        } catch (error) {
          console.error(
            "❌ Background: Failed to display incoming call:",
            error
          );
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
