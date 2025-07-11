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
} from "react-native";
import { AppState } from "react-native";
import { useRef } from "react";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
// import * as Updates from "expo-updates";
import AnimatedSplash from "./SplashScreen";

const SUBSCRIPTION_API = "https://dev.liberdus.com:3030/notifier/subscribe";
const DEVICE_TOKEN_KEY = "device_token";

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

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App has come to foreground
        console.log("🔄 App resumed from background");
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    (async () => {
      Notifications.setBadgeCountAsync(0);
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

  // const pullUpdates = async () => {
  //   // 🔄 Improved auto-update logic
  //   if (Updates.isEnabled) {
  //     try {
  //       const update = await Updates.checkForUpdateAsync();
  //       if (update.isAvailable) {
  //         setUpdateStatus("📥 Downloading update...");
  //         await Updates.fetchUpdateAsync();
  //         setUpdateStatus("✅ Update ready! Restarting...");
  //         // Give user a moment to see the message
  //         setTimeout(async () => {
  //           await Updates.reloadAsync();
  //         }, 1000);
  //       } else {
  //         setUpdateStatus("✅ App is up to date");
  //         // Clear the message after a few seconds
  //         setTimeout(() => setUpdateStatus(""), 3000);
  //       }
  //     } catch (err) {
  //       console.error("❌ Update error:", err);
  //       let errorMessage = "❌ Update check failed";
  //       if (err instanceof Error) {
  //         if (
  //           err.message.includes("No update is available") ||
  //           err.message.includes("Expo Go")
  //         ) {
  //           setUpdateStatus("");
  //         } else {
  //           setUpdateStatus(errorMessage);
  //         }
  //       } else {
  //         setUpdateStatus(errorMessage);
  //       }
  //     }
  //   } else {
  //     setUpdateStatus("⚠️ Updates disabled");
  //   }
  // };

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

  const subscribeToServer = async (
    deviceToken: string,
    expoPushToken: string
  ) => {
    try {
      const payload = {
        deviceToken,
        expoPushToken,
        addresses: [
          "2c9485418b492fb5be57bec4dc6a5eedf082d257000000000000000000000000", // jrp
          "fa7e9c5fbd02d485f3b527908d6f400fe63c2fbc000000000000000000000000", // jrl
        ],
      };

      const response = await axios.post(SUBSCRIPTION_API, payload);
      console.log("✅ Subscribed to notification server:", response.data);
    } catch (error) {
      console.error(
        "❌ Failed to subscribe:",
        axios.isAxiosError(error)
          ? error.response?.data
          : error instanceof Error
          ? error.message
          : String(error)
      );
      Alert.alert("Error", "Failed to subscribe to notification server");
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
    const url = getCurrentUrl();
    if (!url) {
      Alert.alert("Error", "Please select a network or enter a custom URL");
      return;
    }
    if (!deviceToken || !expoPushToken) {
      console.log(
        "❌ Missing deviceToken or expoPushToken:",
        deviceToken,
        expoPushToken
      );
    }

    try {
      const urlWithParams = `${url}?device_token=${deviceToken}&push_token=${expoPushToken}`;
      await Linking.openURL(urlWithParams);
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

  if (!hasLaunchedOnce) {
    return <AnimatedSplash />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{getCurrentTitle()}</Text>
      <Text style={styles.subtitle}>
        Choose a network and tap Launch App to open the app in your default
        browser
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
      {/* </View> */}

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
