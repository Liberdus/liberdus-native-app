import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Alert,
  Platform,
  AlertButton,
  Keyboard,
  View,
  Share,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { AppState } from "react-native";
import { useRef } from "react";
import * as Linking from "expo-linking";
import { WebView } from "react-native-webview";
import * as Notifications from "expo-notifications";
import * as NavigationBar from "expo-navigation-bar";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import FileViewer from "react-native-file-viewer";
import AnimatedSplash from "./SplashScreen";
import CallKeepService from "./CallKeepService";
import { CallData, isStaleCallNotification } from "./CallKeepOptions";
import {
  getMessaging,
  requestPermission,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  AuthorizationStatus,
} from "@react-native-firebase/messaging";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";
import VoipPushNotification from "react-native-voip-push-notification";

const APP_URL = "https://liberdus.com/test/";

// Storage keys
const DEVICE_TOKEN_KEY = "device_token";
const APP_URL_KEY = "app_url";

const APP_RESUME_DELAY_MS = 1500; // 1.5 second delay before checking for app resume

interface APP_PARAMS {
  appVersion: string;
  deviceToken?: string;
  expoPushToken?: string;
  voipToken?: string;
  fcmToken?: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerNotificationChannels() {
  // Register notification categories for both platforms
  // await Notifications.setNotificationCategoryAsync("CALL_ACTION", [
  //   {
  //     identifier: "JOIN_CALL",
  //     buttonTitle: "Join",
  //     options: {
  //       opensAppToForeground: true,
  //       isAuthenticationRequired: false,
  //       isDestructive: false,
  //     },
  //   },
  //   {
  //     identifier: "CANCEL_CALL",
  //     buttonTitle: "Cancel",
  //     options: {
  //       opensAppToForeground: false,
  //       isAuthenticationRequired: false,
  //       isDestructive: true,
  //     },
  //   },
  // ]);

  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync("alerts", {
    name: "Critical Alerts",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 500, 500, 500],
    lightColor: "#FF0000",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync("background", {
    name: "Background Sync",
    importance: Notifications.AndroidImportance.MIN,
    sound: "",
    vibrationPattern: [],
    lightColor: "#999999",
    showBadge: false,
  });

  await Notifications.setNotificationChannelAsync("scheduled_call", {
    name: "Scheduled Call",
    importance: Notifications.AndroidImportance.MAX,
    sound: "ringtone.wav", // Android expects filename without extension
    vibrationPattern: [0, 1000, 1000, 1000, 1000, 1000], // Ring-pause-ring-pause pattern
    lightColor: "#FF0000",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    showBadge: true,
  });
}

export async function getOrCreateDeviceToken(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(16);
  const uuid = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, uuid);
  return uuid;
}

// VoIP Push Notification Setup
export function setupVoIPPushNotifications(
  onTokenReceived?: (token: string) => void
): void {
  if (Platform.OS !== "ios") return;

  console.log("Setting up VoIP push notifications with enhanced handling");

  try {
    let tokenReceived = false;

    // Handle VoIP token registration
    VoipPushNotification.addEventListener("register", (token: string) => {
      console.log("📱 VoIP Push Token received via register:", token);
      if (onTokenReceived && !tokenReceived) {
        tokenReceived = true;
        onTokenReceived(token);
      }
    });

    VoipPushNotification.addEventListener(
      "notification",
      async (notification: any) => {
        console.log("🔔 VoIP push notification received:", notification);

        const appState = AppState.currentState;
        console.log("📱 App state when VoIP received:", appState);

        // Display incoming call through CallKeepService
        try {
          // Check if call notification is stale
          if (isStaleCallNotification(notification as CallData)) {
            return;
          }
          CallKeepService.handleIncomingCall(notification as CallData);
          VoipPushNotification.onVoipNotificationCompleted(notification.callId);

          console.log("✅ VoIP call displayed successfully:");
        } catch (error) {
          console.error("❌ Failed to display VoIP call:", error);
        }
      }
    );

    VoipPushNotification.addEventListener(
      "didLoadWithEvents",
      (events: any[]) => {
        console.log("📋 VoIP push events loaded:", events);

        // Look for registration event and handle the token
        const registerEvent = events.find(
          (event) =>
            event.name === "RNVoipPushRemoteNotificationsRegisteredEvent" &&
            event.data
        );
        if (registerEvent) {
          console.log(
            "📱 VoIP token received from events:",
            registerEvent.data
          );
          if (onTokenReceived && !tokenReceived) {
            tokenReceived = true;
            onTokenReceived(registerEvent.data);
          }
        }

        // Process any queued VoIP notifications
        events.forEach((event, index) => {
          console.log(`🔄 Processing queued VoIP event ${index}:`, event);
          // Complete queued VoIP notification events without showing UI
          if (
            event.name === "RNVoipPushRemoteNotificationReceivedEvent" &&
            event.data
          ) {
            console.log(
              `📞 Completing queued VoIP notification:`,
              event.data.callId
            );
            setTimeout(() => {
              VoipPushNotification.onVoipNotificationCompleted(
                event.data.callId
              );
            }, 1000 * (index + 1)); // Stagger processing
          }
        });
      }
    );

    // Request VoIP push token if not already received from AppDelegate voip registration
    setTimeout(() => {
      if (!tokenReceived) {
        console.log("📱 Requesting VoIP push token");
        VoipPushNotification.registerVoipToken();
      }
    }, 1000);

    setTimeout(() => {
      if (!tokenReceived) {
        console.warn("⚠️ VoIP token not received after 2 seconds");
      }
    }, 2000);
    console.log("📡 VoIP push setup completed");
  } catch (error) {
    console.error("❌ Failed to setup VoIP push notifications:", error);
    throw error;
  }
}

// VoIP Push Notification Cleanup
export function cleanupVoIPPushNotifications(): void {
  if (Platform.OS !== "ios") return;

  try {
    VoipPushNotification.removeEventListener("register");
    VoipPushNotification.removeEventListener("notification");
    VoipPushNotification.removeEventListener("didLoadWithEvents");
    console.log("🧹 VoIP push notification listeners cleaned up");
  } catch (error) {
    console.warn("⚠️ Failed to cleanup VoIP listeners:", error);
  }
}

// Check if file can be viewed by FileViewer
const isViewableFile = (filename: string, mimeType: string): boolean => {
  // Check by MIME type
  const viewableMimeTypes = [
    "image/", // All images
    "text/", // Text files
    "application/pdf", // PDFs
    "video/", // Videos
    "audio/", // Audio files
    "application/json", // JSON
    "application/xml", // XML
    "text/xml", // XML (alternative)
  ];

  return viewableMimeTypes.some((type) => mimeType.startsWith(type));
};

const App: React.FC = () => {
  const appState = useRef(AppState.currentState);
  const appResumeTimer = useRef<NodeJS.Timeout | null>(null);
  const webViewRef = useRef<WebView>(null);
  const showNavBarRef = useRef(true); // Show navigation bar on app launch
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [voipToken, setVoipToken] = useState<string | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [hasLaunchedOnce, setHasLaunchedOnce] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string>("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [needsManualKeyboardHandling, setNeedsManualKeyboardHandling] =
    useState(false);
  const [hasCapturedInitialHeight, setHasCapturedInitialHeight] =
    useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // PROACTIVE: Save state when going to background
      if (
        appState.current === "active" &&
        nextAppState.match(/inactive|background/)
      ) {
        console.log("🔄 App going to background - saving state immediately");

        // Send message to webview to save state
        sendMessageToWebView({ type: "background" });
      }

      // REACTIVE: Handle app resume
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App has come to foreground
        console.log("🔄 App resumed from background");

        const runAppResume = async () => {
          console.log("📱 Running app resume logic");

          // Send message to webview about app foreground
          sendMessageToWebView({ type: "foreground" });
          toggleNavBar(showNavBarRef.current);
          // Check if web app is in white screen
          // runWhiteScreenCheck(); --- Disabled it. Using onContentProcessDidTerminate and onRenderProcessGone to detect white screen instead
        };
        if (appResumeTimer.current !== null) {
          clearTimeout(appResumeTimer.current);
        }
        appResumeTimer.current = setTimeout(runAppResume, APP_RESUME_DELAY_MS);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (appResumeTimer.current) clearTimeout(appResumeTimer.current);
    };
  }, []);

  // Modern keyboard handling - minimal native involvement, let web content handle via Visual Viewport API
  useEffect(() => {
    if (Platform.OS === "android" || Platform.OS === "ios") {
      const keyboardDidShowListener = Keyboard.addListener(
        "keyboardDidShow",
        (event) => {
          const keyboardHeight = event.endCoordinates.height;
          setKeyboardHeight(keyboardHeight);
          setIsKeyboardVisible(true);
          console.log("⌨️ Keyboard shown, height:", keyboardHeight);
          if (hasCapturedInitialHeight) {
            setTimeout(() => {
              sendMessageToWebView({ type: "KEYBOARD_SHOWN", keyboardHeight });
            }, 100); // Increased timeout for better reliability
          } else {
            console.log(
              "⚠️ No valid initial height captured yet, skipping keyboard detection"
            );
          }
        }
      );

      const keyboardDidHideListener = Keyboard.addListener(
        "keyboardDidHide",
        () => {
          setKeyboardHeight(0);
          setIsKeyboardVisible(false);
          setNeedsManualKeyboardHandling(false);
          console.log("⌨️ Keyboard hidden");
        }
      );

      return () => {
        keyboardDidShowListener.remove();
        keyboardDidHideListener.remove();
      };
    }
  }, [hasCapturedInitialHeight]);

  const sendMessageToWebView = (message: object) => {
    const messageJson = JSON.stringify(message);
    if (webViewRef.current) {
      const jsToInject = `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
        messageJson
      )} }));`;
      webViewRef.current.injectJavaScript(jsToInject);
    }
  };

  /**
   * Get all notifications and return them
   * @returns Array of notifications in the panel
   */
  const getPanelNotifications = async () => {
    try {
      // Add a small delay to ensure notifications have time to appear in the system
      await new Promise((resolve) => setTimeout(resolve, 200));

      const presentedNotifications =
        await Notifications.getPresentedNotificationsAsync();
      console.log(
        "📱 Found presented notifications:",
        presentedNotifications.length
      );

      const notificationsData = presentedNotifications.map((notification) => ({
        id: notification.request.identifier,
        title: notification.request.content.title,
        body: notification.request.content.body,
        data: notification.request.content.data,
        date: new Date(notification.date).toISOString(),
      }));

      return notificationsData;
    } catch (error) {
      console.error("❌ Failed to get all panel notifications:", error);
      return [];
    }
  };

  const toggleNavBar = async (visible: boolean) => {
    try {
      if (Platform.OS === "ios") {
        return;
      }
      if (visible) {
        await NavigationBar.setVisibilityAsync("visible");
      } else {
        await NavigationBar.setVisibilityAsync("hidden");
      }
      await NavigationBar.setBehaviorAsync("overlay-swipe");
      await NavigationBar.setPositionAsync("absolute");
    } catch (error) {
      console.warn("⚠️ Failed to hide navigation bar:", error);
    }
  };

  useEffect(() => {
    (async () => {
      // await AsyncStorage.removeItem(APP_URL_KEY);
      await toggleNavBar(showNavBarRef.current);
      await registerNotificationChannels();

      const token = await getOrCreateDeviceToken();
      console.log("📱 Device Token:", token);
      setDeviceToken(token);

      const success = await registerForPushNotificationsAsync();
      console.log("Registered for push notifications:", success);

      // Initialize CallKeep
      try {
        await CallKeepService.setup();
        console.log("✅ CallKeep initialized successfully");
      } catch (error) {
        console.error("❌ CallKeep initialization failed:", error);
      }
      setHasLaunchedOnce(true);
    })();
  }, []);

  useEffect(() => {
    // Listen for notifications when app is in foreground
    const notificationReceivedListener =
      Notifications.addNotificationReceivedListener((notification) => {
        const { data } = notification.request.content;
        const receivedTime = new Date().toLocaleString();
        console.log("👆 Notification received:", { data, receivedTime });
        sendMessageToWebView({
          type: "NEW_NOTIFICATION",
        });
      });

    // Listen for notification response (when user taps notification)
    const notificationResponseListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const { notification, actionIdentifier } = response;
        const { data } = notification.request.content;
        const tappedTime = new Date().toLocaleString();

        console.log("👆 Notification tapped:", { data, tappedTime });

        // // Handle action button responses
        // if (actionIdentifier === "CANCEL_CALL") {
        //   console.log("❌ Cancel call button pressed");
        //   // Clear the notification from the panel - no need to open app
        //   Notifications.dismissNotificationAsync(
        //     notification.request.identifier
        //   );
        // }

        setTimeout(() => {
          sendMessageToWebView({
            type: "NOTIFICATION_TAPPED",
            to: data.to,
            from: data.from,
          });
        }, 300);
      });

    return () => {
      notificationReceivedListener.remove();
      notificationResponseListener.remove();
    };
  }, []);

  // Voip Push Notification handler for iOS
  useEffect(() => {
    if (Platform.OS === "ios") {
      console.log("🔥 Setting up VoIP push notifications");
      setupVoIPPushNotifications((token: string) => {
        setVoipToken(token);
        console.log("📱 VoIP Push Token set:", token);
      });

      return () => {
        cleanupVoIPPushNotifications();
      };
    }
  }, []);

  // Firebase messaging handler for Android
  useEffect(() => {
    if (Platform.OS === "android") {
      console.log("🔥 Setting up Firebase messaging for Android");

      // Request permission for Android notifications
      const requestFirebasePermission = async () => {
        const messagingInstance = getMessaging();
        const authStatus = await requestPermission(messagingInstance);
        const enabled =
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          console.log("📱 Firebase messaging permission granted:", authStatus);
          // Get FCM token
          try {
            const fcmToken = await getToken(messagingInstance);
            console.log("🔑 FCM Token:", fcmToken);
            setFcmToken(fcmToken);
          } catch (error) {
            console.error("❌ Error getting FCM token:", error);
          }
        }
      };

      requestFirebasePermission();

      // Handle foreground messages
      const messagingInstance = getMessaging();
      const firebaseOnMessageListener = onMessage(
        messagingInstance,
        async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
          console.log("📱 FCM message received in foreground:", remoteMessage);

          // Check if this is a call message
          const messageType = remoteMessage.data?.type;
          const isCallMessage = messageType === "incoming_call";

          if (isCallMessage) {
            // Handle call message
            try {
              const callData = remoteMessage.data as unknown as CallData;
              // Check if call notification is stale
              if (isStaleCallNotification(callData)) {
                return;
              }
              CallKeepService.handleIncomingCall(callData);
            } catch (error) {
              console.error(
                "❌ Error processing foreground call message:",
                error
              );
            }
          } else {
            // Handle regular notifications
            console.log("📱 Regular FCM notification in foreground");

            // Create a local notification to display in notification panel
            const notificationTitle =
              remoteMessage.notification?.title || "New Message";
            const notificationBody = remoteMessage.notification?.body || "";

            await Notifications.scheduleNotificationAsync({
              content: {
                title: notificationTitle,
                body: notificationBody,
                data: remoteMessage.data || {},
                sound: "default",
              },
              trigger: null,
            });
          }
        }
      );

      // Handle background messages (when app is backgrounded but not killed)
      const firebaseOnNotificationOpenedAppListener = onNotificationOpenedApp(
        messagingInstance,
        (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
          console.log(
            "📱 FCM message opened app from background:",
            remoteMessage
          );
        }
      );

      // Handle messages when app is completely killed and opened by notification
      getInitialNotification(messagingInstance).then(
        (remoteMessage: FirebaseMessagingTypes.RemoteMessage | null) => {
          if (remoteMessage) {
            console.log(
              "📱 FCM message opened app from killed state:",
              remoteMessage
            );
          }
        }
      );

      // Cleanup listeners
      return () => {
        firebaseOnMessageListener();
        firebaseOnNotificationOpenedAppListener();
      };
    }
  }, []);

  useEffect(() => {
    console.log("📱 Launched once:", hasLaunchedOnce);
    openBrowser();
  }, [hasLaunchedOnce]);

  const registerForPushNotificationsAsync = async () => {
    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        Alert.alert(
          "User disabled notifications",
          "To enable notifications, please accept notification permissions for this application."
        );
        return false;
      }

      console.log("📱 Permission status:", finalStatus);

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      if (!projectId) {
        throw new Error("Project ID not found");
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      console.log("📱 Expo Push Token Data:", tokenData);
      const token = tokenData.data;
      setExpoPushToken(token);

      return true;
    } catch (error) {
      console.error(
        "❌ Failed to configure push notifications:",
        error instanceof Error ? error.message : String(error)
      );
      Alert.alert("Error", "Failed to configure push notifications");
      return false;
    }
  };

  const openBrowser = async () => {
    const url = (await AsyncStorage.getItem(APP_URL_KEY)) || APP_URL;

    try {
      setWebViewUrl(url);
      setShowWebView(true);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("Error opening URL:", reason);
      Alert.alert(
        "Error",
        `An error occurred while trying to open the browser: ${reason}`
      );
    }
  };

  // Simple file handling with download option
  const handleFileDownload = async (
    base64Data: string,
    filename: string,
    mimeType: string,
    showOpenOption = true
  ) => {
    try {
      console.log(`📥 Processing file download: ${filename} (${mimeType})`);

      // Check if file is viewable
      const showOpen = showOpenOption && isViewableFile(filename, mimeType);

      // Show download confirmation with conditional options
      const alertOptions: AlertButton[] = [
        {
          text: "Download",
          onPress: () => downloadFile(base64Data, filename, mimeType),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ];

      // Only add "Open" option if file is viewable
      if (showOpen) {
        alertOptions.unshift({
          text: "Open",
          onPress: () => openFile(base64Data, filename, mimeType),
        });
      }

      Alert.alert(
        `Filename - ${filename}`,
        "Choose an action for this file:",
        alertOptions
      );
    } catch (error) {
      console.error("❌ Error handling file download:", error);
      Alert.alert(
        "Error",
        `Could not process ${filename}. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  // Open file immediately
  const openFile = async (
    base64Data: string,
    filename: string,
    mimeType: string
  ) => {
    try {
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const tempFileUri = FileSystem.documentDirectory + sanitizedFilename;

      await FileSystem.writeAsStringAsync(tempFileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await FileViewer.open(tempFileUri, {
        showOpenWithDialog: true,
        showAppsSuggestions: true,
        displayName: filename,
      });

      console.log("✅ File opened successfully");
    } catch (error) {
      console.log("⚠️ FileViewer failed, trying share:", error);
      // Fallback to share
      await shareFile(base64Data, filename, mimeType);
    }
  };

  // Download file to device
  const downloadFile = async (
    base64Data: string,
    filename: string,
    mimeType: string
  ) => {
    try {
      if (Platform.OS === "android") {
        // Android: Use Storage Access Framework for Downloads
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (!permissions.granted) {
          Alert.alert(
            "Permission Denied",
            "Storage access is required to download files."
          );
          return;
        }

        if (
          permissions.directoryUri.includes("raw%3A") ||
          permissions.directoryUri.includes("msd%3A")
        ) {
          Alert.alert(
            "Can't Use This Folder",
            "Please select a folder from the internal storage in the file manager, such as 'Downloads/Liberdus'."
          );
          return;
        }

        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          filename,
          mimeType
        );

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Alert.alert(
          "Download Complete",
          `${filename} has been downloaded successfully!`,
          [{ text: "OK" }]
        );
      } else {
        // iOS: Save to app's documents and share
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
        const fileUri = FileSystem.documentDirectory + sanitizedFilename;

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: mimeType,
            dialogTitle: `Save ${filename}`,
          });
        }
      }

      console.log("✅ File downloaded successfully");
    } catch (error) {
      console.error("❌ Download failed:", error);
      Alert.alert("Download Error", "Could not download the file.");
    }
  };

  // Share file using system share
  const shareFile = async (
    base64Data: string,
    filename: string,
    mimeType: string
  ) => {
    try {
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const tempFileUri = FileSystem.documentDirectory + sanitizedFilename;

      await FileSystem.writeAsStringAsync(tempFileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempFileUri, {
          mimeType: mimeType,
          dialogTitle: `Open ${filename} with...`,
        });
        console.log("✅ File shared successfully");

        // Clean up temp file after a delay
        setTimeout(async () => {
          try {
            const fileInfo = await FileSystem.getInfoAsync(tempFileUri);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(tempFileUri);
              console.log("🗑️ Cleaned up temp file");
            }
          } catch (cleanupError) {
            console.log("Cleanup error (non-critical):", cleanupError);
          }
        }, 30000); // Clean up after 30 seconds
      } else {
        throw new Error("Sharing not available");
      }
    } catch (error) {
      console.error("❌ Sharing failed:", error);
      Alert.alert("Error", "Could not share file");
    }
  };

  // const injectedJavaScript = `
  //   (function() {
  //     const sendLog = (level, args) => {
  //       try {
  //         window.ReactNativeWebView.postMessage(JSON.stringify({
  //           type: 'WEB_LOG',
  //           level: level,
  //           message: Array.from(args).join(' ')
  //         }));
  //       } catch (err) {}
  //     };

  //     ['log', 'warn', 'error', 'info', 'debug'].forEach((level) => {
  //       const original = console[level];
  //       console[level] = function(...args) {
  //         original.apply(console, args);
  //         sendLog(level, args);
  //       };
  //     });
  //   })();
  //   true;
  // `;

  // Main WebView message handler
  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // console.log("📡 Received message:", data);

      // Handle notification requests from webview
      if (data.type === "GetAllPanelNotifications") {
        console.log("📋 WebView requested all panel notifications");
        const notifications = await getPanelNotifications();
        sendMessageToWebView({
          type: "ALL_NOTIFICATIONS_IN_PANEL",
          notifications,
        });
        return;
      }

      // type LogLevel = "log" | "warn" | "error" | "info" | "debug";

      // if (data.type === "WEB_LOG") {
      //   const logLevel = data.level.toUpperCase() as LogLevel;
      //   const logFn = console[logLevel] || console.log;
      //   logFn(`[WebView ${logLevel}]`, data.message);
      //   return;
      // }
      if (data.type === "EXPORT_BACKUP") {
        const { dataUrl, filename } = data;
        const base64 = dataUrl.split(",")[1];
        const mimeType =
          dataUrl.match(/^data:(.*);base64/)?.[1] || "application/json";

        console.log("📦 Processing backup export:", filename);
        await handleFileDownload(base64, filename, mimeType, false);
      } else if (data.type === "DOWNLOAD_ATTACHMENT") {
        const { dataUrl, filename, mime } = data;
        const base64 = dataUrl.split(",")[1];
        const mimeType = mime || "application/octet-stream";

        console.log("📥 Processing attachment download:", filename, mimeType);
        // Use FileViewer for all other file types
        await handleFileDownload(base64, filename, mimeType);
      } else if (data.type === "launch") {
        const { url } = data;
        console.log("🚀 Launch message received with URL:", url);

        // Close current web view and open new URL
        setShowWebView(false);

        // save URL to AsyncStorage
        await AsyncStorage.setItem(APP_URL_KEY, url);

        // Add a small delay to ensure the web view is properly closed before opening new one
        setTimeout(() => {
          console.log("🔗 Opening new URL in WebView:", url);
          setWebViewUrl(url);
          setShowWebView(true);
        }, 100);
      } else if (data.type === "WHITE_SCREEN_DETECTED") {
        console.warn("⚪ White screen detected. Reloading WebView...");
        webViewRef.current?.reload();
      } else if (data.type === "KEYBOARD_DETECTION") {
        const { needsManualHandling } = data;
        console.log("⌨️ Keyboard detection result:", { needsManualHandling });
        setNeedsManualKeyboardHandling(needsManualHandling);
      } else if (data.type === "VIEWPORT_HEIGHT") {
        if (!hasCapturedInitialHeight && data.height > 400) {
          setHasCapturedInitialHeight(true);
          console.log("📏 Initial viewport height captured:", data.height);
        }
      } else if (data.type === "NAV_BAR") {
        console.log("🔌 Received navigation bar update:", data);
        showNavBarRef.current = data.visible;
        await toggleNavBar(data.visible);
      } else if (data.type === "CLEAR_NOTI") {
        console.log("🗑️ Received clear notifications message");
        await Notifications.setBadgeCountAsync(0);
        await Notifications.dismissAllNotificationsAsync();
      } else if (data.type === "SHARE_INVITE") {
        const { url, text, title } = data;
        console.log("📤 Sharing invite:", { url, text, title });
        try {
          await Share.share(
            {
              title: title,
              message: text,
              url: url,
            },
            {
              dialogTitle: title || "Share Liberdus Invite",
              subject: title,
            }
          );
          console.log("✅ Invite shared successfully");
        } catch (error) {
          console.error("❌ Sharing failed:", error);
        }
      } else if (data.type === "SCHEDULE_CALL") {
        const { username, timestamp } = data;
        const identifier = `call-${username}-${timestamp}`;
        console.log("📞 Scheduling call notification:", {
          username,
          timestamp,
        });

        const scheduledDate = new Date(timestamp);
        const now = new Date();

        if (scheduledDate <= now) {
          console.warn("⚠️ Cannot schedule notification for past time");
          return;
        }
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: "📞 Liberdus Call",
            body: `You have a scheduled call with ${username}.`,
            data: {
              type: "SCHEDULE_CALL",
              username,
              timestamp,
            },
            sound: "ringtone.wav",
            priority: Notifications.AndroidNotificationPriority.MAX,
            // categoryIdentifier: "CALL_ACTION",
            ...(Platform.OS === "ios" && {
              badge: 1,
              launchImageName: "icon",
            }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: scheduledDate,
            ...(Platform.OS === "android" && {
              channelId: "scheduled_call",
            }),
          },
        });

        console.log(
          "✅ Call notification scheduled successfully for:",
          scheduledDate.toLocaleString()
        );
      } else if (data.type === "CANCEL_SCHEDULE_CALL") {
        const { username, timestamp } = data;
        const identifier = `call-${username}-${timestamp}`;
        console.log("📞 Canceling scheduled call notification:", {
          username,
          timestamp,
        });
        await Notifications.cancelScheduledNotificationAsync(identifier);
        const scheduledDate = new Date(timestamp);
        console.log(
          "🛑 Cancelled scheduled call notification for:",
          scheduledDate.toLocaleString()
        );
      } else if (data.type === "APP_PARAMS") {
        const appVersion = Constants.expoConfig?.version || "unknown";
        const data: APP_PARAMS = {
          appVersion,
        };
        if (deviceToken && (expoPushToken || voipToken || fcmToken)) {
          data.deviceToken = deviceToken;
          if (expoPushToken) {
            data.expoPushToken = expoPushToken;
          }
          if (voipToken) {
            data.voipToken = voipToken;
          }
          if (fcmToken) {
            data.fcmToken = fcmToken;
          }
        }
        console.log("🚀 App parameters:", data);
        sendMessageToWebView({
          type: "APP_PARAMS",
          data,
        });
      } else {
        console.error("❌ Unexpected message received:", data);
      }
    } catch (err) {
      console.error("❌ WebView message error:", err);
    }
  };

  const runWhiteScreenCheck = () => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
      (function() {
        const bg = getComputedStyle(document.body).backgroundColor;
        const isWhite = bg.includes('rgb(255, 255, 255)') || bg === '#fff '|| bg === '#ffffff' || bg === 'white';
        const isEmpty = document.body.innerText.trim().length === 0;
        if (isWhite && isEmpty) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WHITE_SCREEN_DETECTED' }));
        }
      })();
      true;
    `);
    }
  };

  const isExternalLink = (current: string, test: string): boolean => {
    const a = new URL(current);
    const b = new URL(test);

    if (a.origin !== b.origin) return true;

    const aPath = a.pathname.replace(/\/+$/, "");
    const bPath = b.pathname.replace(/\/+$/, "");

    return bPath !== aPath;
  };

  if (!hasLaunchedOnce) {
    console.log("🚀 Launching app for the first time");
    return <AnimatedSplash />;
  }

  if (showWebView) {
    // Modern approach: WebView fills parent, web content handles keyboard

    // Log modern keyboard handling approach
    if (Platform.OS === "android" && isKeyboardVisible) {
      console.log("⌨️ Keyboard handling:", {
        keyboardHeight,
        needsManualHandling: false,
        applyingMargin: false,
        mode: "MODERN_WEB_APPROACH",
        webViewProps: {
          contentInsetAdjustmentBehavior: "never",
          automaticallyAdjustContentInsets: false,
          nestedScrollEnabled: true,
        },
      });
    }

    return (
      <View
        style={styles.container}
        onLayout={(event) => {
          const { width, height, x, y } = event.nativeEvent.layout;
          console.log(
            `📐 [${new Date().toISOString().slice(11, 23)}] CONTAINER LAYOUT:`,
            { width, height, x, y }
          );
          console.log(
            `   ⌨️  Keyboard status: ${
              isKeyboardVisible ? "VISIBLE" : "HIDDEN"
            }`
          );
        }}
      >
        <StatusBar hidden={true} />
        <WebView
          key={webViewUrl}
          ref={webViewRef}
          webviewDebuggingEnabled={true}
          source={{ uri: webViewUrl }}
          style={styles.webView}
          allowsInlineMediaPlayback={true} // ✅ Required for <video> on iOS
          mediaPlaybackRequiresUserAction={false} // ✅ Let camera start automatically
          // mediaCapturePermissionGrantType={"grant"} // ✅ Prompt for media capture permissions
          // allowsProtectedMedia={true} // ✅ Allow protected media content
          // allowsAirPlayForMediaPlayback={true} // ✅ Allow media playback features
          // allowsPictureInPictureMediaPlayback={true} // ✅ Enable media features
          // allowsFullscreenVideo // On Android, this makes Keyboard to cover the input box on focus
          useWebView2
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error("WebView error: ", nativeEvent);
            Alert.alert("WebView Error", "Failed to load the page");
          }}
          // Enable JavaScript
          javaScriptEnabled={true}
          // Enable DOM storage
          domStorageEnabled={true}
          // Allow mixed content (HTTP and HTTPS)
          mixedContentMode="compatibility"
          // Allow universal access from file URLs
          allowUniversalAccessFromFileURLs={true}
          // Start in loading state
          startInLoadingState={true}
          // Allow file access
          allowFileAccess={true}
          // Add caching policy to prevent white screens
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          // Enable hardware acceleration for Android
          renderToHardwareTextureAndroid={true}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url;
            const openInBrowser = isExternalLink(webViewUrl, url);
            console.log(
              "🔗 onShouldStartLoadWithRequest URL:",
              url,
              webViewUrl,
              openInBrowser
            );
            if (openInBrowser) {
              Linking.openURL(url);
              return false; // prevent WebView from loading it
            }
            return true; // allow normal navigation
          }}
          // Needed for iOS to make `onShouldStartLoadWithRequest` work
          setSupportMultipleWindows={false}
          // injectedJavaScript={injectedJavaScript} // Can be used for logging the webview console
          onMessage={handleWebViewMessage}
          /* Modern approach: Disable WebView automatic adjustments - let web content handle keyboard */
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          /* Reduce rubber-banding and horizontal bounce */
          bounces={false}
          overScrollMode="never"
          directionalLockEnabled={true}
          /* Enable nested scrolling for better touch handling */
          nestedScrollEnabled={true}
          /* Disable native scrolling to let web content handle scrolling */
          scrollEnabled={false}
          /* Additional scroll prevention */
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          // Add load end handler
          onLoadEnd={async () => {
            console.log("✅ WebView load completed");

            // const timestamp = Date.now() + 10 * 1000; // After 10 seconds from now

            // setTimeout(() => {
            //   console.log(
            //     `📞 Triggering scheduled call notification for timestamp: ${timestamp}`
            //   );
            //   if (webViewRef.current) {
            //     // Inject JavaScript to send SCHEDULE_CALL message to schedule a notification
            //     webViewRef.current.injectJavaScript(`
            //       (function() {
            //         // Send SCHEDULE_CALL message
            //         window.ReactNativeWebView.postMessage(JSON.stringify({
            //           type: 'SCHEDULE_CALL',
            //           username: 'jai',
            //           timestamp: ${timestamp}
            //         }));

            //       })();
            //       true;
            //     `);
            //   }
            // }, 1000); // Wait 1 seconds after load

            // setTimeout(() => {
            //   console.log(
            //     `📞 Clearing scheduled call notification for timestamp: ${timestamp}`
            //   );
            //   if (webViewRef.current) {
            //     // Inject JavaScript to send CANCEL_SCHEDULE_CALL message to cancel the scheduled notification
            //     webViewRef.current.injectJavaScript(`
            //       (function() {
            //         // Send CANCEL_SCHEDULE_CALL message
            //         window.ReactNativeWebView.postMessage(JSON.stringify({
            //           type: 'CANCEL_SCHEDULE_CALL',
            //           username: 'jai',
            //           timestamp: ${timestamp}
            //         }));

            //       })();
            //       true;
            //     `);
            //   }
            // }, 3000); // Wait 3 seconds after load
          }}
          // Add load start handler
          onLoadStart={() => {
            console.log("🔄 WebView load started");
          }}
          // WHITE SCREEN FIX ON IOS
          onContentProcessDidTerminate={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn("❌ Content process terminated", nativeEvent);
            webViewRef.current?.reload();
          }}
          // WHITE SCREEN FIX ON ANDROID
          onRenderProcessGone={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn("❌ Render process gone: ", nativeEvent);
            webViewRef.current?.reload();
          }}
        />
      </View>
    );
  }
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
  },
  webView: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
  },
});

export default App;
