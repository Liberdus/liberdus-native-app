import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  ScrollView,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
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
import AnimatedSplash from "./SplashScreen";

const APP_URL = "https://liberdus.com/dev";

// Storage keys
const DEVICE_TOKEN_KEY = "device_token";
const APP_URL_KEY = "app_url";

const Network = {
  main: {
    name: "Mainnet",
    url: "https://liberdus.com/app",
    icon: "🚀",
    title: "Liberdus Mainnet App",
  },
  test: {
    name: "Testnet",
    url: "https://liberdus.com/test",
    icon: "🧪",
    title: "Liberdus Testnet App",
  },
  dev: {
    name: "Devnet",
    url: "https://liberdus.com/dev",
    icon: "🛠",
    title: "Liberdus Devnet App",
  },
  custom: {
    name: "Custom",
    url: "",
    icon: "⚙️",
    title: "Liberdus Custom App",
  },
};

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

const App: React.FC = () => {
  const appState = useRef(AppState.currentState);
  const webViewRef = useRef<WebView>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >(undefined);
  // const [updateStatus, setUpdateStatus] = useState<string>("");
  const [selectedNetwork, setSelectedNetwork] = useState<string>("dev");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [hasLaunchedOnce, setHasLaunchedOnce] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string>("");
  const [canGoBack, setCanGoBack] = useState(false);

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
      // await pullUpdates();
      await registerNotificationChannels();
      const token = await getOrCreateDeviceToken();
      console.log("📱 Device Token:", token);
      setDeviceToken(token);

      const success = await registerForPushNotificationsAsync();

      const notificationListener =
        Notifications.addNotificationReceivedListener((notification) => {
          setNotification(notification);
        });

      const responseListener =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log("📱 Notification Response Received:", response);
        });

      console.log("📱 Launched once:", hasLaunchedOnce);
      setTimeout(() => setHasLaunchedOnce(true), 3000);

      console.log("Registered for push notifications:", success);
      return () => {
        notificationListener.remove();
        responseListener.remove();
      };
    })();
  }, []);

  useEffect(() => {
    if (hasLaunchedOnce) return;
    if (!deviceToken || !expoPushToken) return;
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

      // subscribeToServer(deviceToken, token);
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

  const handleNetworkSelect = async (network: string) => {
    setSelectedNetwork(network);
    if (network === "custom") {
      setShowCustomInput(true);
    } else {
      setShowCustomInput(false);
    }
  };

  const getCurrentUrl = () => {
    if (selectedNetwork === "custom") {
      return customUrl;
    }
    return Network[selectedNetwork as keyof typeof Network].url;
  };

  const getCurrentTitle = () => {
    const network = Network[selectedNetwork as keyof typeof Network];
    return `${network.icon} ${network.title}`;
  };

  const openBrowser = async () => {
    // const url = getCurrentUrl();
    // if (!url) {
    //   Alert.alert("Error", "Please select a network or enter a custom URL");
    //   return;
    // }
    const url = (await AsyncStorage.getItem(APP_URL_KEY)) || APP_URL;

    if (!deviceToken || !expoPushToken) {
      console.log(
        "❌ Missing deviceToken or expoPushToken:",
        deviceToken,
        expoPushToken
      );
    }

    try {
      const urlWithParams = `${url}?device_token=${deviceToken}&push_token=${expoPushToken}`;
      // await Linking.openURL(urlWithParams);
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

  const handleWebViewNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "GET_APP_URL") {
        // Get the current app_url from AsyncStorage or use the default
        const url = (await AsyncStorage.getItem(APP_URL_KEY)) || APP_URL;
        // Send it back to the WebView
        if (webViewRef.current) {
          webViewRef.current.postMessage(
            JSON.stringify({ type: "APP_URL", url })
          );
        }
        return;
      }

      if (data.type === "EXPORT_BACKUP") {
        const { dataUrl, filename } = data;
        console.log("📦 Received backup file");

        // Extract base64 content from data URL
        const base64 = dataUrl.split(",")[1];
        const mimeType =
          dataUrl.match(/^data:(.*);base64/)?.[1] || "application/json";

        // Save to temporary file first
        const tempFileUri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(tempFileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log("📁 Temp file saved at:", tempFileUri);

        if (Platform.OS === "ios") {
          // iOS: Show share dialog
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(tempFileUri);
          } else {
            Alert.alert("File Saved", "Backup saved to: " + tempFileUri);
          }
        } else {
          // Android: Ask user to pick folder and save using SAF
          Alert.alert(
            "Select Save Location",
            "📁 Please choose a folder (e.g., inside Downloads) to save your backup file.",
            [
              {
                text: "Continue",
                onPress: async () => {
                  const permissions =
                    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

                  if (!permissions.granted) {
                    Alert.alert(
                      "Permission Denied",
                      "Storage access was not granted."
                    );
                    return;
                  }

                  const dirUri = permissions.directoryUri;

                  try {
                    const fileUri =
                      await FileSystem.StorageAccessFramework.createFileAsync(
                        dirUri,
                        filename,
                        mimeType
                      );

                    await FileSystem.writeAsStringAsync(fileUri, base64, {
                      encoding: FileSystem.EncodingType.Base64,
                    });

                    console.log("✅ File saved to:", fileUri);
                    Alert.alert("Backup Saved", "File saved to: " + filename);
                  } catch (err) {
                    console.error("❌ Failed to save using SAF:", err);
                    Alert.alert("Error", "Failed to save file: " + err.message);
                  }
                },
              },
            ]
          );
        }
      } else if (data.type === "DOWNLOAD_ATTACHMENT") {
        const { dataUrl, filename, mime } = data;

        // pull out base‑64
        const base64 = dataUrl.split(",")[1];
        const mimeType = mime || "application/octet-stream";

        const tempFileUri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(tempFileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (Platform.OS === "ios") {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(tempFileUri, { UTI: mimeType });
          } else {
            Alert.alert("File Saved", "Attachment saved to: " + tempFileUri);
          }
        } else {
          Alert.alert(
            "Select Save Location",
            "📁 Choose a folder (e.g. Downloads) to save your file.",
            [
              {
                text: "Continue",
                onPress: async () => {
                  const permissions =
                    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                  if (!permissions.granted) return;

                  const fileUri =
                    await FileSystem.StorageAccessFramework.createFileAsync(
                      permissions.directoryUri,
                      filename,
                      mimeType
                    );
                  await FileSystem.writeAsStringAsync(fileUri, base64, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                  Alert.alert("Saved", "File saved to: " + filename);
                },
              },
            ]
          );
        }
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
            onNavigationStateChange={handleWebViewNavigationStateChange}
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content" // or "light-content" depending on your UI
      />
      <Text style={styles.title}>{getCurrentTitle()}</Text>
      <Text style={styles.subtitle}>
        {/* Choose a network and tap Launch App to open the app in your default
        browser  */}
        Choose a network and tap Launch App to open the app
      </Text>

      <Text style={styles.sectionTitle}>Select Network</Text>

      {/* Icon Grid */}
      <View style={styles.iconGrid}>
        {Object.entries(Network).map(([key, network]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.iconCard,
              selectedNetwork === key && styles.selectedIconCard,
            ]}
            onPress={() => handleNetworkSelect(key)}
          >
            <Text style={styles.icon}>{network.icon}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {showCustomInput && (
        <View style={styles.customInputContainer}>
          <Text style={styles.sectionTitle}>Custom URL</Text>
          <TextInput
            style={styles.input}
            value={customUrl}
            onChangeText={setCustomUrl}
            placeholder="Enter custom URL (e.g., http://liberdus.com/staging)"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
      )}

      <TouchableOpacity style={styles.launchButton} onPress={openBrowser}>
        <Text style={styles.launchButtonText}>Launch App</Text>
      </TouchableOpacity>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          🌍 Network: {Network[selectedNetwork as keyof typeof Network].name}
        </Text>
        <Text style={styles.infoText}>🔗 URL: {getCurrentUrl()}</Text>
        <Text style={styles.infoText}>
          📱 Platform: {Platform.OS === "ios" ? "iOS" : "Android"}
        </Text>
        <Text style={styles.infoText}>✅ Device token: </Text>
        <Text style={styles.noteText}>
          {deviceToken ? deviceToken : "Unavailable"}
        </Text>
        <Text style={styles.infoText}>✅ Push token: </Text>
        <Text style={styles.noteText}>
          {expoPushToken
            ? expoPushToken.substring(
                expoPushToken.indexOf("[") + 1,
                expoPushToken.indexOf("]")
              )
            : "Unavailable"}
        </Text>
        {/* {updateStatus != "" && (
          <View>
            <Text style={styles.infoText}>📦 Update status:</Text>
            <Text style={styles.noteText}>{updateStatus}</Text>
          </View>
        )} */}
      </View>

      {notification && (
        <View style={styles.notificationContainer}>
          <Text style={styles.notificationTitle}>📩 Notification:</Text>
          <Text style={styles.notificationText}>
            {notification.request.content.title}
          </Text>
          <Text style={styles.notificationText}>
            {notification.request.content.body}
          </Text>
          <Text style={styles.notificationText}>📌 Data:</Text>
          {Object.keys(notification.request.content.data).map((key, index) => (
            <Text key={index} style={styles.notificationText}>
              {`${key}: ${notification.request.content.data[key]}`}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webView: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  iconGrid: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 5,
    marginBottom: 20,
  },
  iconCard: {
    backgroundColor: "white",
    borderRadius: 12,
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e8ecf0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  selectedIconCard: {
    borderColor: "#4CAF50",
    backgroundColor: "#f8fff8",
    shadowColor: "#4CAF50",
    shadowOpacity: 0.2,
    transform: [{ scale: 1.05 }],
  },
  icon: {
    fontSize: 28,
  },
  customInputContainer: {
    width: "100%",
    maxWidth: 350,
    marginBottom: 20,
  },
  input: {
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  launchButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 12,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    minWidth: 200,
    marginBottom: 30,
  },
  launchButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  infoContainer: {
    alignItems: "center",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minWidth: 300,
  },
  infoText: {
    fontSize: 14,
    color: "#333",
    marginTop: 8,
    textAlign: "center",
  },
  noteText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 250,
  },
  notificationContainer: {
    marginTop: 20,
    alignItems: "center",
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minWidth: 300,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  notificationText: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 4,
    maxWidth: 250,
  },
});

export default App;
