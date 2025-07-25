import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  AlertButton,
} from "react-native";
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

const APP_URL = "https://liberdus.com/dev";

// Storage keys
const DEVICE_TOKEN_KEY = "device_token";
const APP_URL_KEY = "app_url";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerNotificationChannels() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
  });

  await Notifications.setNotificationChannelAsync("alerts", {
    name: "Critical Alerts",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 500, 500, 500],
    lightColor: "#FF0000",
  });

  await Notifications.setNotificationChannelAsync("background", {
    name: "Background Sync",
    importance: Notifications.AndroidImportance.MIN,
    sound: "",
    vibrationPattern: [],
    lightColor: "#999999",
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
  const webViewRef = useRef<WebView>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string>("dev");
  const [hasLaunchedOnce, setHasLaunchedOnce] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string>("");

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          // App has come to foreground
          console.log("🔄 App resumed from background");
          await Notifications.setBadgeCountAsync(0);
        }
        appState.current = nextAppState;
      }
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    NavigationBar.setVisibilityAsync("hidden");
    NavigationBar.setBehaviorAsync("overlay-swipe");
  }, []);

  useEffect(() => {
    (async () => {
      await Notifications.setBadgeCountAsync(0);
      await registerNotificationChannels();
      const token = await getOrCreateDeviceToken();
      console.log("📱 Device Token:", token);
      setDeviceToken(token);

      const success = await registerForPushNotificationsAsync();

      console.log("📱 Launched once:", hasLaunchedOnce);
      setTimeout(() => setHasLaunchedOnce(true), 3000);

      console.log("Registered for push notifications:", success);
    })();
  }, []);

  useEffect(() => {
    if (hasLaunchedOnce) return;
    openBrowser();
  }, [deviceToken, expoPushToken, hasLaunchedOnce]);

  const registerForPushNotificationsAsync = async () => {
    try {
      if (!Device.isDevice) {
        Alert.alert("Error", "Must use physical device for Push Notifications");
        return false;
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        Alert.alert("Permission denied", "Failed to get push token");
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
      const urlWithParams =
        deviceToken && expoPushToken
          ? `${url}?device_token=${deviceToken}&push_token=${expoPushToken}`
          : url;
      setWebViewUrl(urlWithParams);
      setShowWebView(true);
      setHasLaunchedOnce(true);
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

  // Main WebView message handler - much simpler now!
  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

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
          // Add device and push tokens to the new URL if they exist
          let newUrl = url;
          if (deviceToken && expoPushToken) {
            const separator = url.includes("?") ? "&" : "?";
            newUrl = `${url}${separator}device_token=${deviceToken}&push_token=${expoPushToken}`;
          }

          console.log("🔗 Opening new URL in WebView:", newUrl);
          setWebViewUrl(newUrl);
          setShowWebView(true);
        }, 100);
      } else {
        console.error("❌ Unexpected message received:", data);
      }
    } catch (err) {
      console.error("❌ WebView message error:", err);
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
    return <AnimatedSplash />;
  }

  if (showWebView) {
    return (
      <SafeAreaView
        style={{
          ...styles.webViewContainer,
          paddingTop: StatusBar.currentHeight,
        }}
      >
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="dark-content" // or "light-content" depending on your UI
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <WebView
            ref={webViewRef}
            // nativeConfig={{ props: { webContentsDebuggingEnabled: true } }}
            source={{ uri: webViewUrl }}
            style={styles.webView}
            allowsInlineMediaPlayback={true} // ✅ Required for <video> on iOS
            mediaPlaybackRequiresUserAction={false} // ✅ Let camera start automatically
            allowsFullscreenVideo
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
            onMessage={handleWebViewMessage}
            // Bounce effect on iOS
            bounces={true}
            // Scroll enabled
            scrollEnabled={true}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
};

const styles = StyleSheet.create({
  webViewContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webView: {
    flex: 1,
  },
});

export default App;
