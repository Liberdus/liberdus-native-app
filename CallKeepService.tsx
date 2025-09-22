import RNCallKeep from "react-native-callkeep";
import { Platform, AppState } from "react-native";
import uuid from "react-native-uuid";

export interface CallData {
  callerName: string;
  callId: string;
  sentAt: string;
  hasVideo: boolean;
}

export const callKeepOptions = {
  ios: {
    appName: "Liberdus",
    maximumCallGroups: "1",
    maximumCallsPerCallGroup: "1",
    supportsVideo: false,
    includesCallsInRecents: true,
  },
  android: {
    alertTitle: "Phone call permissions",
    alertDescription: "This application needs access to manage phone calls",
    cancelButton: "Cancel",
    okButton: "OK",
    additionalPermissions: [],
    selfManaged: false,
    // Add foreground service configuration for Android 10+
    foregroundService: {
      channelId: "com.liberdus.callkeep",
      channelName: "Liberdus Background Call Service",
      notificationTitle: "Liberdus is handling calls",
      notificationIcon: "ic_launcher", // Uses your app icon
    },
  },
};

export const ANDROID_INCOMING_CALL_TIMEOUT_MS = 60 * 1000; // 1 minute

class CallKeepService {
  public isSetup: boolean = false;
  private currentCallUUID: string | null = null;
  private incomingCallTimeout: ReturnType<typeof setTimeout> | null = null;

  public async setup(
    appState: "active" | "background" = "active"
  ): Promise<void> {
    if (this.isSetup) return;

    try {
      console.log(`🔧 Starting CallKeep setup for ${Platform.OS}...`);
      await RNCallKeep.setup(callKeepOptions);
      if (Platform.OS === "android") RNCallKeep.setAvailable(true);
      this.setupEventListeners();

      // Platform-specific permissions and setup
      if (Platform.OS === "ios" && appState === "active") {
        await this.requestIOSPermissions();
      } else if (Platform.OS === "android" && appState === "active") {
        // Android-specific setup
        console.log("🤖 Setting up Android-specific CallKeep features...");
        try {
          // Check and request phone account permissions
          const hasPhoneAccount = await this.checkPhoneAccountPermission();
          console.log(`📞 Android phone account status: ${hasPhoneAccount}`);

          if (!hasPhoneAccount) {
            console.log("🔐 Requesting Android phone account permission...");
            const permissionGranted =
              await this.requestPhoneAccountPermission();
            console.log(
              `📞 Android phone account permission granted: ${permissionGranted}`
            );

            if (!permissionGranted) {
              console.warn(
                "⚠️ Android phone account permission not granted - call UI may not work properly"
              );
            }
          }

          // Register Android events
          console.log("📡 Registering Android CallKeep events...");
          RNCallKeep.registerAndroidEvents();
        } catch (androidError) {
          console.error("❌ Android CallKeep setup error:", androidError);
          // Don't throw - continue with basic setup
        }
      }

      this.isSetup = true;
      console.log(
        `✅ CallKeep setup completed successfully for ${Platform.OS}`
      );
    } catch (error) {
      console.error(`❌ CallKeep setup failed for ${Platform.OS}:`, error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    RNCallKeep.addEventListener("answerCall", this.onAnswerCall);
    RNCallKeep.addEventListener("endCall", this.onEndCall);
    RNCallKeep.addEventListener("didPerformDTMFAction", this.onDTMFAction);
    RNCallKeep.addEventListener("didReceiveStartCallAction", this.onStartCall);
    RNCallKeep.addEventListener(
      "didDisplayIncomingCall",
      this.onIncomingCallDisplayed
    );
    RNCallKeep.addEventListener(
      "didPerformSetMutedCallAction",
      this.onMuteCall
    );
    RNCallKeep.addEventListener("didToggleHoldCallAction", this.onHoldCall);
    RNCallKeep.addEventListener(
      "didActivateAudioSession",
      this.onAudioSessionActivated
    );
    RNCallKeep.addEventListener(
      "didDeactivateAudioSession",
      this.onAudioSessionDeactivated
    );
  }

  private async requestIOSPermissions(): Promise<void> {
    try {
      console.log("Requesting iOS CallKit permissions...");
      // CallKit permissions are requested automatically during setup
      // but we can add additional checks here if needed
    } catch (error) {
      console.error("Failed to request iOS permissions:", error);
    }
  }

  public getCurrentCallUUID(): string | null {
    return this.currentCallUUID;
  }

  public clearCurrentCall(): void {
    this.currentCallUUID = null;
    this.clearIncomingCallTimeout();
  }

  public handleIncomingCall(data: CallData): void {
    try {
      const callerName = data.callerName || "Unknown Caller";
      const callUUID = data.callId;

      console.log("📞 Handling Incoming Call", {
        callerName,
        callUUID,
      });

      // Store call data for handling
      this.currentCallUUID = callUUID;
      this.displayIncomingCall(callerName, callUUID);
      this.startIncomingCallTimeout(callUUID);
      console.log("✅ Call displayed successfully");
    } catch (error) {
      console.error("❌ Failed to handle incoming call:", error);
      throw error; // Re-throw to let caller handle the error
    }
  }

  private displayIncomingCall(
    callerName: string = "Unknown",
    providedUUID?: string,
    hasVideo: boolean = false
  ): string {
    const callUUID = providedUUID || (uuid.v4() as string);
    this.currentCallUUID = callUUID;

    try {
      console.log(
        `📞 Displaying incoming call: ${callerName} (UUID: ${callUUID}) on ${Platform.OS}, 🔧 CallKeep setup status: ${this.isSetup} `
      );

      // Validate that RNCallKeep module is available
      if (!RNCallKeep || !RNCallKeep.displayIncomingCall) {
        console.error(
          "❌ RNCallKeep module or displayIncomingCall method not available"
        );
        throw new Error("RNCallKeep module not available");
      }

      console.log("🚀 CallKeep validation passed, displaying call...");
      RNCallKeep.displayIncomingCall(
        callUUID,
        callerName,
        callerName, // localizedCallerName
        "generic", // handleType
        hasVideo
      );

      console.log(
        `✅ RNCallKeep.displayIncomingCall completed for: ${callUUID} from ${callerName}`
      );

      return callUUID;
    } catch (error) {
      console.error("❌ Failed to display incoming call:", error);
      this.currentCallUUID = null;
      return callUUID; // Return the UUID even if there was an error
    }
  }

  public startCall(
    callUUID: string,
    handle: string,
    contactIdentifier?: string,
    hasVideo: boolean = false
  ): void {
    try {
      RNCallKeep.startCall(
        callUUID,
        handle,
        contactIdentifier,
        "generic",
        hasVideo
      );
      console.log(`Outgoing call started: ${callUUID} to ${handle}`);
    } catch (error) {
      console.error("Failed to start call:", error);
      throw error;
    }
  }

  public endCall(callUUID: string): void {
    try {
      this.clearIncomingCallTimeout();
      RNCallKeep.endCall(callUUID);
      console.log(`Call ${callUUID} ended`);
    } catch (error) {
      console.error("Failed to end call:", error);
      // Don't throw error to prevent app crashes
      try {
        RNCallKeep.endAllCalls();
        console.log("✅ Fallback: All calls ended");
      } catch (fallbackError) {
        console.error("❌ Fallback also failed:", fallbackError);
      }
    }
  }

  public setMutedCall(callUUID: string, muted: boolean): void {
    try {
      RNCallKeep.setMutedCall(callUUID, muted);
      console.log(`Call ${callUUID} muted: ${muted}`);
    } catch (error) {
      console.error("Failed to set mute state:", error);
      throw error;
    }
  }

  public setOnHold(callUUID: string, held: boolean): void {
    try {
      RNCallKeep.setOnHold(callUUID, held);
      console.log(`Call ${callUUID} on hold: ${held}`);
    } catch (error) {
      console.error("Failed to set hold state:", error);
      throw error;
    }
  }

  public async checkPhoneAccountPermission(): Promise<boolean> {
    if (Platform.OS === "android") {
      try {
        return await RNCallKeep.hasPhoneAccount();
      } catch (error) {
        console.error("Failed to check phone account permission:", error);
        return false;
      }
    }
    return true; // iOS doesn't need this permission
  }

  public async requestPhoneAccountPermission(): Promise<boolean> {
    if (Platform.OS === "android") {
      try {
        return await RNCallKeep.hasPhoneAccount();
      } catch (error) {
        console.error("Failed to request phone account permission:", error);
        return false;
      }
    }
    return true; // iOS doesn't need this permission
  }

  // Enhanced Event handlers
  private onAnswerCall = ({ callUUID }: { callUUID: string }): void => {
    console.log("📞 Call answered:", callUUID);
    this.currentCallUUID = callUUID;
    this.clearIncomingCallTimeout();

    console.log("🔄 Call answered - bringing app to foreground");

    const appState = AppState.currentState;
    console.log(`📱 App state when call answered: ${appState}`);

    // Bring app to foreground immediately
    try {
      console.log("🔄 Immediately bringing app to foreground");
      RNCallKeep.backToForeground();
      console.log("✅ backToForeground() called successfully");
    } catch (error) {
      console.error("❌ Failed to bring app to foreground:", error);
    }

    // End the call after 100ms [ This helps the app to come to foreground ]
    setTimeout(async () => {
      console.log("📞 Ending call", callUUID);
      this.endCall(callUUID);
      console.log("✅ endCall() called successfully");
    }, 100);

    // Aggressive end call logic for app state changes
    const handleAppStateChange = (nextAppState: string) => {
      console.log(`📱 App state changed from killed to: ${nextAppState}`);

      if (nextAppState === "active") {
        console.log("📱 App became active - immediate call end and cleanup");
        subscription.remove();
        // Immediate call end when app becomes active from killed state
        console.log("📞 Ending call from appState active ", callUUID);
        this.endCall(callUUID);
      } else if (nextAppState === "background") {
        console.log("📱 App moved to background - attempting call end");
        // Also end call if app goes to background (might be transitioning)
        console.log("📞 Ending call from appState background", callUUID);
        this.endCall(callUUID);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Cleanup timeout
    setTimeout(() => {
      subscription.remove();
      console.log("🔄 App state listener cleaned up after 2 seconds");
    }, 2000);
  };

  private onEndCall = ({ callUUID }: { callUUID: string }): void => {
    console.log("📞 Call ended:", callUUID);

    // Clear current call if it matches
    if (this.currentCallUUID === callUUID) {
      this.currentCallUUID = null;
    }

    this.clearIncomingCallTimeout();

    // End the call
    try {
      RNCallKeep.endCall(callUUID);
      console.log(`✅ Call ${callUUID} ended successfully on ${Platform.OS}`);
    } catch (error) {
      console.error(
        `❌ Failed to end call ${callUUID} on ${Platform.OS}:`,
        error
      );
      // Try ending all calls as fallback
      try {
        RNCallKeep.endAllCalls();
        console.log("✅ All calls ended as fallback");
      } catch (fallbackError) {
        console.error("❌ Failed to end all calls:", fallbackError);
      }
    }
  };

  private onDTMFAction = ({
    callUUID,
    digits,
  }: {
    callUUID: string;
    digits: string;
  }): void => {
    console.log("DTMF action:", callUUID, digits);
    // Handle DTMF tones here
  };

  private onStartCall = (args: {
    handle: string;
    callUUID?: string;
    name?: string;
  }): void => {
    console.log("Start call action:", args.callUUID, args.handle);
    // Handle outgoing call start here
  };

  private onIncomingCallDisplayed = (args: {
    callUUID: string;
    handle: string;
    fromPushKit: string;
    hasVideo: string;
    localizedCallerName: string;
    payload: object;
  }): void => {
    console.log(
      "Incoming call displayed:",
      args.callUUID,
      args.handle,
      args.fromPushKit === "1"
    );
  };

  private onMuteCall = ({
    callUUID,
    muted,
  }: {
    callUUID: string;
    muted: boolean;
  }): void => {
    console.log("Mute call action:", callUUID, muted);
    // Handle mute/unmute logic here
  };

  private onHoldCall = ({
    callUUID,
    hold,
  }: {
    callUUID: string;
    hold: boolean;
  }): void => {
    console.log("Hold call action:", callUUID, hold);
    // Handle hold/unhold logic here
  };

  private onAudioSessionActivated = (): void => {
    console.log("Audio session activated");
    // Handle audio session activation
  };

  private onAudioSessionDeactivated = (): void => {
    console.log("Audio session deactivated");
    // Handle audio session deactivation
  };

  public cleanup(): void {
    if (this.isSetup) {
      RNCallKeep.removeEventListener("answerCall");
      RNCallKeep.removeEventListener("endCall");
      RNCallKeep.removeEventListener("didPerformDTMFAction");
      RNCallKeep.removeEventListener("didReceiveStartCallAction");
      RNCallKeep.removeEventListener("didDisplayIncomingCall");
      RNCallKeep.removeEventListener("didPerformSetMutedCallAction");
      RNCallKeep.removeEventListener("didToggleHoldCallAction");
      RNCallKeep.removeEventListener("didActivateAudioSession");
      RNCallKeep.removeEventListener("didDeactivateAudioSession");

      this.isSetup = false;
    }

    this.clearIncomingCallTimeout();
  }

  private startIncomingCallTimeout(callUUID: string): void {
    if (Platform.OS !== "android") return;

    this.clearIncomingCallTimeout();
    console.log(
      `⏱️ Starting timeout for Android call ${callUUID} (${ANDROID_INCOMING_CALL_TIMEOUT_MS}ms)`
    );

    this.incomingCallTimeout = setTimeout(() => {
      console.log(
        `⏱️ Auto ending incoming call ${callUUID} after ${ANDROID_INCOMING_CALL_TIMEOUT_MS}ms timeout`
      );

      // Double-check the call is still active and unanswered
      if (this.currentCallUUID === callUUID) {
        console.log(`🔚 Force ending timed-out call ${callUUID}`);
        this.endCall(callUUID);
      } else {
        console.log(`ℹ️ Call ${callUUID} already handled, skipping timeout`);
      }
    }, ANDROID_INCOMING_CALL_TIMEOUT_MS);
  }

  private clearIncomingCallTimeout(): void {
    if (!this.incomingCallTimeout) return;

    console.log("⏱️ Clearing Android call timeout");
    clearTimeout(this.incomingCallTimeout);
    this.incomingCallTimeout = null;
  }
}

export default new CallKeepService();
