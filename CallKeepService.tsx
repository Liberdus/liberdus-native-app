import RNCallKeep from "react-native-callkeep";
import { Platform, AppState, DeviceEventEmitter } from "react-native";
import uuid from "react-native-uuid";
import VoipPushNotification from "react-native-voip-push-notification";
import * as Notifications from "expo-notifications";

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
  };
}

class CallKeepService {
  private isSetup: boolean = false;
  private currentCallUUID: string | null = null;
  private callKeepOptions: CallKeepOptions = {
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
    },
  };

  public async setup(): Promise<void> {
    if (this.isSetup) return;

    try {
      await RNCallKeep.setup(this.callKeepOptions);
      this.setupEventListeners();

      // Request permissions for iOS
      if (Platform.OS === "ios") {
        await this.requestIOSPermissions();
        try {
          this.setupVoIPPushNotifications();
        } catch (error) {
          console.warn("⚠️ VoIP push notification setup failed, continuing without it:", error);
        }
      }

      this.isSetup = true;
      console.log("CallKeep setup completed successfully");
    } catch (error) {
      console.error("CallKeep setup failed:", error);
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
      // Register for VoIP push notifications
      VoipPushNotification.addEventListener("register", (token: string) => {
        console.log("✅ VoIP push token received:", token);
        // Emit event so App.tsx can send token to server
        DeviceEventEmitter.emit('voipTokenReceived', token);
      });

    VoipPushNotification.addEventListener(
      "notification",
      (notification: any) => {
        console.log("🔔 VoIP push notification received:", notification);
        
        // Enhanced handling for background/killed state
        const appState = AppState.currentState;
        console.log("📱 App state when VoIP received:", appState);

        // Extract call information with better fallbacks
        const callerName = notification.callerName || 
                          notification.from || 
                          notification.caller ||
                          notification.data?.callerName ||
                          "Unknown Caller";
        
        const callUUID = notification.uuid || 
                        notification.callUUID ||
                        notification.data?.callUUID ||
                        (uuid.v4() as string);

        const hasVideo = notification.hasVideo || 
                        notification.data?.hasVideo || 
                        false;

        console.log(`📞 Processing VoIP call: ${callerName} (UUID: ${callUUID})`);

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
            appState
          });

          // Emit event for app to handle call data
          DeviceEventEmitter.emit('incomingVoIPCall', {
            callUUID,
            callerName,
            hasVideo,
            notification,
            appState
          });

          // For killed/background state, ensure call screen is ready
          if (appState !== 'active') {
            console.log("🚀 App not active, preparing background call handling");
            this.prepareBackgroundCallHandling(callUUID, callerName, notification);
          }

        } catch (error) {
          console.error("❌ Failed to display VoIP call:", error);
          // Fallback: try to send high priority local notification
          this.sendHighPriorityCallNotification(callerName, callUUID);
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
          if (event.type === 'notification' && event.data) {
            setTimeout(() => {
              VoipPushNotification.onVoipNotificationCompleted(event.callUUID);
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

  private async prepareBackgroundCallHandling(callUUID: string, callerName: string, notification: any): Promise<void> {
    try {
      // Wake up the app's call handling logic
      console.log("🔄 Preparing background call handling");
      
      // Emit event that app can listen to even in background
      DeviceEventEmitter.emit('backgroundCallReceived', {
        callUUID,
        callerName,
        notification,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error("❌ Failed to prepare background call handling:", error);
    }
  }

  private async sendHighPriorityCallNotification(callerName: string, callUUID: string): Promise<void> {
    try {
      console.log("🚨 Sending high priority fallback notification");
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Incoming Call",
          body: `Call from ${callerName}`,
          sound: 'default',
          priority: Notifications.AndroidImportance.MAX.toString(),
          categoryIdentifier: 'call',
          data: {
            type: 'call',
            callUUID,
            callerName,
            timestamp: Date.now()
          }
        },
        trigger: null, // Immediate
      });

    } catch (error) {
      console.error("❌ Failed to send high priority notification:", error);
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
    if (Platform.OS === 'android') {
      try {
        console.log("📱 Processing high priority data message:", data);
        
        // Check if this is a call notification
        if (data.type === 'call' || data.messageType === 'call') {
          const callerName = data.callerName || data.from || "Unknown Caller";
          const callUUID = data.callUUID || (uuid.v4() as string);
          
          console.log("📞 High priority call data received:", { callerName, callUUID });
          
          // Immediately trigger CallKeep
          this.displayIncomingCall(callerName);
          
          // Also send local high priority notification as backup
          await this.sendHighPriorityCallNotification(callerName, callUUID);
        }
      } catch (error) {
        console.error("❌ Failed to process high priority data message:", error);
      }
    }
  }

  public displayIncomingCall(callerName: string = "Unknown"): string {
    const callUUID = uuid.v4() as string;
    this.currentCallUUID = callUUID;

    try {
      console.log(`📞 Displaying incoming call: ${callerName} (UUID: ${callUUID})`);
      
      // Enhanced parameters for better CallKeep integration
      RNCallKeep.displayIncomingCall(
        callUUID,
        callerName,
        callerName, // localizedCallerName
        "generic", // handleType
        false // hasVideo
      );
      
      console.log(`✅ Incoming call displayed successfully: ${callUUID} from ${callerName}`);
      
      // Emit event for app to handle
      DeviceEventEmitter.emit('callDisplayed', {
        callUUID,
        callerName,
        timestamp: Date.now()
      });
      
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

  // Enhanced Event handlers
  private onAnswerCall = ({ callUUID }: { callUUID: string }): void => {
    console.log("📞 Call answered:", callUUID);
    this.currentCallUUID = callUUID;
    
    // Force app to foreground when call is answered from lock screen
    console.log("🔄 Call answered from lock screen - bringing app to foreground");
    
    // This is crucial for waking the app when answered from lock screen
    setTimeout(() => {
      if (Platform.OS === 'ios') {
        // Request app to come to foreground
        RNCallKeep.backToForeground();
      }
    }, 100); // Small delay to ensure CallKit processes the answer first
    
    // Emit event for app to handle call answer
    DeviceEventEmitter.emit('callAnswered', {
      callUUID,
      timestamp: Date.now()
    });
    
    // Automatically end the call after answering (since we just want to open the app)
    setTimeout(() => {
      console.log("🔄 Auto-ending call to open app:", callUUID);
      this.endCall(callUUID);
      this.clearCurrentCall();
      
      // Emit event that the notification call is complete and app should handle
      DeviceEventEmitter.emit('notificationCallCompleted', {
        callUUID,
        timestamp: Date.now()
      });
    }, 500); // Small delay to ensure CallKit UI shows briefly
    
    // Complete VoIP notification if it exists
    if (Platform.OS === 'ios') {
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
    
    // Emit event for app to handle call end
    DeviceEventEmitter.emit('callEnded', {
      callUUID,
      timestamp: Date.now()
    });
    
    // End the call
    RNCallKeep.endCall(callUUID);
    
    // Complete VoIP notification if it exists
    if (Platform.OS === 'ios') {
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
