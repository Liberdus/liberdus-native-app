import RNCallKeep from "react-native-callkeep";
import { Platform, AppState, DeviceEventEmitter } from "react-native";
import uuid from "react-native-uuid";
import VoipPushNotification from "react-native-voip-push-notification";

export interface CallKeepOptions {
  ios: {
    appName: string;
    maximumCallGroups: string;
    maximumCallsPerCallGroup: string;
    supportsVideo: boolean;
    includesCallsInRecents: boolean;
  };
  android: {
    alertTitle: string;
    alertDescription: string;
    cancelButton: string;
    okButton: string;
    imageName?: string;
    additionalPermissions: string[];
    selfManaged: boolean;
    foregroundService?: {
      channelId: string;
      channelName: string;
      notificationTitle: string;
      notificationIcon: string;
    };
  };
}

class CallKeepService {
  public isSetup: boolean = false;
  private currentCallUUID: string | null = null;
  private callKeepOptions: CallKeepOptions = {
    ios: {
      appName: "Liberdus",
      maximumCallGroups: "1",
      maximumCallsPerCallGroup: "1",
      supportsVideo: false,
      includesCallsInRecents: false,
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

  public async setup(): Promise<void> {
    if (this.isSetup) return;

    try {
      console.log(`🔧 Starting CallKeep setup for ${Platform.OS}...`);
      await RNCallKeep.setup(this.callKeepOptions);
      this.setupEventListeners();

      // Platform-specific permissions and setup
      if (Platform.OS === "ios") {
        await this.requestIOSPermissions();
        try {
          this.setupVoIPPushNotifications();
        } catch (error) {
          console.warn(
            "⚠️ VoIP push notification setup failed, continuing without it:",
            error
          );
        }
      } else if (Platform.OS === "android") {
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

  private setupVoIPPushNotifications(): void {
    console.log("Setting up VoIP push notifications with enhanced handling");

    try {
      VoipPushNotification.addEventListener(
        "notification",
        (notification: any) => {
          console.log("🔔 VoIP push notification received:", notification);

          // Enhanced handling for background/killed state
          const appState = AppState.currentState;
          console.log("📱 App state when VoIP received:", appState);

          // Extract call information with better fallbacks
          const callerName =
            notification.callerName ||
            notification.from ||
            notification.caller ||
            notification.data?.callerName ||
            "Unknown Caller";

          const callUUID =
            notification.uuid ||
            notification.callUUID ||
            notification.data?.callUUID ||
            (uuid.v4() as string);

          const hasVideo =
            notification.hasVideo || notification.data?.hasVideo || false;

          console.log(
            `📞 Processing VoIP call: ${callerName} (UUID: ${callUUID})`
          );

          // Store current call info
          this.currentCallUUID = callUUID;

          // Display incoming call immediately with enhanced error handling
          try {
            RNCallKeep.displayIncomingCall(
              callUUID,
              callerName,
              callerName,
              "generic",
              hasVideo
            );

            console.log("✅ VoIP call displayed successfully:", {
              callUUID,
              callerName,
              hasVideo,
              appState,
            });
          } catch (error) {
            console.error("❌ Failed to display VoIP call:", error);
          }
        }
      );

      VoipPushNotification.addEventListener(
        "didLoadWithEvents",
        (events: any[]) => {
          console.log("📋 VoIP push events loaded:", events);
          // Process any queued VoIP notifications
          events.forEach((event, index) => {
            console.log(`🔄 Processing queued VoIP event ${index}:`, event);
            // Re-trigger notification handling for queued events
            if (event.type === "notification" && event.data) {
              setTimeout(() => {
                VoipPushNotification.onVoipNotificationCompleted(
                  event.callUUID
                );
              }, 1000 * (index + 1)); // Stagger processing
            }
          });
        }
      );

      // Request VoIP push token
      VoipPushNotification.registerVoipToken();
      console.log("📡 VoIP push token registration initiated");
    } catch (error) {
      console.error("❌ Failed to setup VoIP push notifications:", error);
      throw error;
    }
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

  public getVoIPPushToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (Platform.OS === "ios") {
        const timeout = setTimeout(() => {
          reject(new Error("VoIP token request timed out"));
        }, 10000); // 10 second timeout

        const handleRegister = (token: string) => {
          clearTimeout(timeout);
          VoipPushNotification.removeEventListener("register");
          resolve(token);
        };

        VoipPushNotification.addEventListener("register", handleRegister);
        VoipPushNotification.registerVoipToken();
      } else {
        reject(new Error("VoIP push notifications are only available on iOS"));
      }
    });
  }

  public getCurrentCallUUID(): string | null {
    return this.currentCallUUID;
  }

  public clearCurrentCall(): void {
    this.currentCallUUID = null;
  }

  public async sendHighPriorityDataMessage(data: any): Promise<void> {
    // For FCM high priority data messages that work with killed apps
    if (Platform.OS === "android") {
      try {
        console.log("📱 Processing high priority data message:", data);

        // Check if this is a call notification
        if (
          data.type === "call" ||
          data.messageType === "call" ||
          data.type === "incoming_call"
        ) {
          const callerName = data.callerName || data.from || "Unknown Caller";
          const callUUID =
            data.callUUID || data.callId || (uuid.v4() as string);

          console.log("📞 Android call notification received:", {
            callerName,
            callUUID,
          });

          // Store call data for handling
          this.currentCallUUID = callUUID;

          // Check if this is from background handler and app is killed
          const isFromBackgroundHandler = data.fromBackgroundHandler === true;
          const forceImmediate = data.forceImmediate === true;
          const currentAppState = AppState.currentState;
          
          console.log(
            "📱 Current app state:",
            currentAppState,
            "- fromBackground:",
            isFromBackgroundHandler,
            "- forceImmediate:",
            forceImmediate
          );

          try {
            // For killed app from background handler, use most aggressive approach
            if (isFromBackgroundHandler && forceImmediate) {
              console.log("💀 App is killed - using maximum aggressive approach");
              
              // Try the headless task approach first for killed apps
              try {
                console.log("🔄 Killed app: Triggering headless task directly");
                const { NativeModules } = require("react-native");
                if (NativeModules.RNCallKeep) {
                  // Try to trigger headless task via native module
                  NativeModules.RNCallKeep.displayIncomingCall(
                    callUUID,
                    callerName,
                    callerName,
                    false
                  );
                  console.log("✅ Killed app: Headless task triggered successfully");
                  return;
                } else {
                  throw new Error("Native module not available");
                }
              } catch (headlessError) {
                console.log("⚠️ Killed app: Headless task failed:", headlessError);
              }
              
              // If all attempts fail, just log the failure
              console.log("❌ Killed app: All headless task attempts failed");
              return;
            }

            // For background/active state, use existing logic
            if (currentAppState !== "active") {
              console.log(
                "🚀 App not active - trying multiple direct call approaches"
              );

              // First attempt: Try direct display without any setup
              try {
                console.log("🔄 Attempt 1: Direct call display without setup");
                RNCallKeep.displayIncomingCall(
                  callUUID,
                  callerName,
                  callerName,
                  "generic",
                  false
                );
                console.log("✅ Direct call display successful without setup");
                return;
              } catch (directError) {
                console.log("⚠️ Direct display failed:", directError);
              }

              // Second attempt: Try with minimal setup
              try {
                console.log("🔄 Attempt 2: Setup then display");
                await this.setup();
                this.displayIncomingCall(callerName, callUUID);
                console.log("✅ Call displayed after setup");
                return;
              } catch (setupError) {
                console.log("⚠️ Setup + display failed:", setupError);
              }

              // Third attempt failed - no more options for background state
              console.log("❌ All attempts failed for background app state");
              return;
            }

            // For active app state - standard flow
            if (!this.isSetup) {
              console.log("🔧 CallKeep not setup, initializing...");
              await this.setup();
            }

            this.displayIncomingCall(callerName, callUUID);
            console.log("✅ Call displayed successfully in active app state");
          } catch (error) {
            console.error("❌ All call display attempts failed:", error);
          }
        }
      } catch (error) {
        console.error(
          "❌ Failed to process Android high priority data message:",
          error
        );
      }
    }
  }


  public displayIncomingCall(
    callerName: string = "Unknown",
    providedUUID?: string
  ): string {
    const callUUID = providedUUID || (uuid.v4() as string);
    this.currentCallUUID = callUUID;

    try {
      console.log(
        `📞 Displaying incoming call: ${callerName} (UUID: ${callUUID}) on ${Platform.OS}`
      );
      console.log(`🔧 CallKeep setup status: ${this.isSetup}`);

      // If CallKeep is not initialized, try to display call directly anyway
      if (!this.isSetup) {
        console.warn(
          "⚠️ CallKeep not initialized, attempting direct call display..."
        );
        // Try to display call directly - this might work if the native module is available
        try {
          RNCallKeep.displayIncomingCall(
            callUUID,
            callerName,
            callerName, // localizedCallerName
            "generic", // handleType
            false // hasVideo
          );
          console.log(
            `✅ Direct call display succeeded without setup: ${callUUID} from ${callerName}`
          );
          return callUUID;
        } catch (directError) {
          console.warn("⚠️ Direct call display failed:", directError);
          // Continue to throw error so caller can handle appropriately
          throw new Error(
            `CallKeep not initialized and direct call failed: ${directError}`
          );
        }
      }

      // Android-specific permission check
      if (Platform.OS === "android") {
        console.log("🔐 Checking Android phone account permissions...");
        try {
          const hasPhoneAccount = this.checkPhoneAccountPermission();
          console.log(
            `📞 Android phone account permission: ${hasPhoneAccount}`
          );

          if (!hasPhoneAccount) {
            console.warn(
              "⚠️ Android: No phone account permission - this may prevent call UI from showing"
            );
          }
        } catch (permError) {
          console.error(
            "❌ Error checking Android phone account permission:",
            permError
          );
        }
      }

      // Enhanced parameters for better CallKeep integration
      console.log(
        `🚀 Attempting to display call via RNCallKeep.displayIncomingCall...`
      );
      RNCallKeep.displayIncomingCall(
        callUUID,
        callerName,
        callerName, // localizedCallerName
        "generic", // handleType
        false // hasVideo
      );

      console.log(
        `✅ RNCallKeep.displayIncomingCall completed for: ${callUUID} from ${callerName}`
      );

      // Additional Android-specific verification and fallback
      if (Platform.OS === "android") {
        setTimeout(async () => {
          console.log("🔍 Android: Verifying call display after delay...");

          // Check if we need to provide a fallback notification
          try {
            const hasPhoneAccount = await this.checkPhoneAccountPermission();
            if (!hasPhoneAccount) {
              console.warn(
                "⚠️ Android: Phone account not available, call UI may not be showing"
              );
              console.log(
                "📱 Consider implementing fallback notification for call"
              );
            }
          } catch (verifyError) {
            console.error(
              "❌ Android: Error verifying call display:",
              verifyError
            );
          }
        }, 1000);
      }

      return callUUID;
    } catch (error) {
      console.error("❌ Failed to display incoming call:", error);
      this.currentCallUUID = null;
      throw error;
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
      RNCallKeep.endCall(callUUID);
      console.log(`Call ended: ${callUUID}`);
    } catch (error) {
      console.error("Failed to end call:", error);
      throw error;
    }
  }

  public endAllCalls(): void {
    try {
      RNCallKeep.endAllCalls();
      console.log("All calls ended");
    } catch (error) {
      console.error("Failed to end all calls:", error);
      throw error;
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

  private handleCallEndingFromKilledState(callUUID: string): void {
    console.log("🔄 Setting up fast call ending for killed app state");

    // For killed app state, we want faster call ending to launch the app quickly
    const fastDelays = [100, 300, 600]; // Much faster delays

    fastDelays.forEach((delay, index) => {
      setTimeout(() => {
        console.log(
          `🔄 Fast killed state call end attempt ${index + 1} after ${delay}ms`
        );
        this.performCallEnd(callUUID, `killed-fast-${index + 1}`);
      }, delay);
    });

    // More aggressive app state monitoring with immediate action
    const handleAppStateChange = (nextAppState: string) => {
      console.log(`📱 App state changed from killed to: ${nextAppState}`);

      if (nextAppState === "active") {
        console.log("📱 App became active - immediate call end and cleanup");
        subscription.remove();
        // Immediate call end when app becomes active from killed state
        this.performCallEnd(callUUID, "app-became-active-immediate");
      } else if (nextAppState === "background") {
        console.log("📱 App moved to background - attempting call end");
        // Also end call if app goes to background (might be transitioning)
        setTimeout(() => {
          this.performCallEnd(callUUID, "app-to-background");
        }, 50);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Shorter cleanup timeout since we want faster response
    setTimeout(() => {
      subscription.remove();
      console.log("🔄 App state listener cleaned up after 5 seconds");
    }, 5000);
  }

  private handleCallEndingFromActiveState(callUUID: string): void {
    console.log("🔄 Setting up call ending for active app state");

    // For active app, use immediate + backup strategy
    const autoEndDelay = Platform.OS === "android" ? 300 : 200;
    console.log(
      `⏱️ Setting auto-end timer for ${autoEndDelay}ms on ${Platform.OS}`
    );

    // Immediate end call attempt
    this.performCallEnd(callUUID, "immediate");

    // Backup end call attempts with shorter delays since app is active
    const backupDelays = [autoEndDelay, autoEndDelay * 2];
    backupDelays.forEach((delay, index) => {
      setTimeout(() => {
        console.log(
          `🔄 Active state backup call end attempt ${
            index + 1
          } after ${delay}ms`
        );
        this.performCallEnd(callUUID, `active-backup-${index + 1}`);
      }, delay);
    });
  }

  private performCallEnd(callUUID: string, attempt: string): void {
    // Only proceed if this call is still current
    if (this.currentCallUUID !== callUUID) {
      console.log(
        `🚫 Skipping ${attempt} end call - ${callUUID} is no longer current call`
      );
      return;
    }

    try {
      console.log(`📞 ${attempt} ending call ${callUUID} on ${Platform.OS}`);
      RNCallKeep.endCall(callUUID);

      // Only clear if this was our current call
      if (this.currentCallUUID === callUUID) {
        this.clearCurrentCall();
        console.log(
          `✅ Call ${callUUID} ended successfully on ${Platform.OS} (${attempt})`
        );

        // For killed app scenarios, be more aggressive about bringing app to foreground
        const isKilledAppAttempt =
          attempt.includes("killed") || attempt.includes("app-became-active");

        if (isKilledAppAttempt) {
          console.log("🚀 Killed app call ended - aggressively launching app");
          try {
            // Multiple attempts to bring app to foreground
            RNCallKeep.backToForeground();

            // Also emit event for immediate app handling
            DeviceEventEmitter.emit("appLaunchCallCompleted", {
              callUUID,
              timestamp: Date.now(),
              platform: Platform.OS,
              fromKilledState: true,
            });

            // Additional foreground attempt after short delay
            setTimeout(() => {
              try {
                RNCallKeep.backToForeground();
                console.log("✅ Secondary app launch attempt completed");
              } catch (secondaryError) {
                console.log("⚠️ Secondary app launch failed:", secondaryError);
              }
            }, 200);
          } catch (launchError) {
            console.error("❌ Failed to launch app aggressively:", launchError);
          }
        } else {
          // Standard app launch call completion event
          if (attempt === "immediate" || attempt.includes("active-backup-1")) {
            DeviceEventEmitter.emit("appLaunchCallCompleted", {
              callUUID,
              timestamp: Date.now(),
              platform: Platform.OS,
              fromKilledState: false,
            });
          }
        }
      }
    } catch (error) {
      console.error(
        `❌ Failed to end call ${callUUID} on ${Platform.OS} (${attempt}):`,
        error
      );

      // Try endAllCalls as fallback for critical attempts
      if (
        attempt === "immediate" ||
        attempt.includes("killed-fast-1") ||
        attempt === "app-became-active-immediate"
      ) {
        try {
          console.log(`🔄 Attempting endAllCalls() fallback on ${Platform.OS}`);
          RNCallKeep.endAllCalls();
          this.clearCurrentCall();
          console.log(`✅ All calls ended as fallback on ${Platform.OS}`);

          // Still try to launch app even with fallback
          if (
            attempt.includes("killed") ||
            attempt.includes("app-became-active")
          ) {
            try {
              RNCallKeep.backToForeground();
            } catch (launchError) {
              console.log("⚠️ App launch failed in fallback:", launchError);
            }
          }
        } catch (fallbackError) {
          console.error(
            `❌ Failed to end calls with fallback on ${Platform.OS}:`,
            fallbackError
          );
        }
      }
    }
  }

  // Enhanced Event handlers
  private onAnswerCall = ({ callUUID }: { callUUID: string }): void => {
    console.log("📞 Call answered:", callUUID);
    this.currentCallUUID = callUUID;

    console.log(
      "🔄 Call answered from lock screen - bringing app to foreground"
    );

    // Check if we're in a fresh app launch (killed state recovery)
    const appState = AppState.currentState;
    const isAppJustLaunched = appState !== "active";

    console.log(
      `📱 App state when call answered: ${appState}, isAppJustLaunched: ${isAppJustLaunched}`
    );

    // Bring app to foreground immediately
    try {
      console.log("🔄 Immediately bringing app to foreground");
      RNCallKeep.backToForeground();
      console.log("✅ backToForeground() called successfully");
    } catch (error) {
      console.error("❌ Failed to bring app to foreground:", error);
    }

    // Platform-specific immediate handling
    if (Platform.OS === "android") {
      console.log("📱 Android call answered - immediate foreground handling");

      // Emit immediate event for Android
      DeviceEventEmitter.emit("androidCallAnswered", {
        callUUID,
        timestamp: Date.now(),
      });
    }

    // For killed app state, we want faster call ending and more aggressive app launch
    if (isAppJustLaunched) {
      console.log(
        "🚀 App was killed - using fast call ending with aggressive app launch"
      );
      this.handleCallEndingFromKilledState(callUUID);
    } else {
      console.log(
        "🏃 App was already running - using standard call ending strategy"
      );
      this.handleCallEndingFromActiveState(callUUID);
    }

    // Complete VoIP notification if it exists
    if (Platform.OS === "ios") {
      try {
        VoipPushNotification.onVoipNotificationCompleted(callUUID);
      } catch (error) {
        console.warn("⚠️ Could not complete VoIP notification:", error);
      }
    }
  };

  private onEndCall = ({ callUUID }: { callUUID: string }): void => {
    console.log("📞 Call ended:", callUUID);

    // Clear current call if it matches
    if (this.currentCallUUID === callUUID) {
      this.currentCallUUID = null;
    }

    // End the call with platform-specific handling
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

    // Complete VoIP notification if it exists
    if (Platform.OS === "ios") {
      try {
        VoipPushNotification.onVoipNotificationCompleted(callUUID);
      } catch (error) {
        console.warn("⚠️ Could not complete VoIP notification:", error);
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

      // Clean up VoIP listeners
      if (Platform.OS === "ios") {
        VoipPushNotification.removeEventListener("register");
        VoipPushNotification.removeEventListener("notification");
        VoipPushNotification.removeEventListener("didLoadWithEvents");
      }

      this.isSetup = false;
    }
  }
}

export default new CallKeepService();
