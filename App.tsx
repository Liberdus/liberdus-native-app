import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const DEV_NETWORK_URL = "https://liberdus.com/dev";
const SUBSCRIPTION_API = "https://dev.liberdus.com:3030/notifier/subscribe";

const DEVICE_TOKEN_KEY = "device_token";

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
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<
    Notifications.Notification | undefined
  >(undefined);

  useEffect(() => {
    (async () => {
      await registerNotificationChannels();
      const token = await getOrCreateDeviceToken();
      console.log("📱 Device Token:", token);
      setDeviceToken(token);

      await registerForPushNotificationsAsync(token);

      const notificationListener =
        Notifications.addNotificationReceivedListener((notification) => {
          console.log("📱 Notification Received:", notification);
          setNotification(notification);
        });

      const responseListener =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log("📱 Notification Response Received:", response);
        });

      return () => {
        notificationListener.remove();
        responseListener.remove();
      };
    })();
  }, []);

  const registerForPushNotificationsAsync = async (deviceToken: string) => {
    try {
      if (!Device.isDevice) {
        Alert.alert("Error", "Must use physical device for Push Notifications");
        return;
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
        return;
      }

      console.log("📱 Permission status:", finalStatus);

      const tokenData = await Notifications.getExpoPushTokenAsync();
      console.log("📱 Expo Push Token Data:", tokenData);
      const token = tokenData.data;
      setExpoPushToken(token);
      console.log("📱 Expo Push Token:", token);

      // subscribeToServer(deviceToken, token);
    } catch (error) {
      console.error(
        "❌ Failed to configure push notifications:",
        error instanceof Error ? error.message : String(error)
      );
      Alert.alert("Error", "Failed to configure push notifications");
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

  const openBrowser = async () => {
    try {
      await Linking.openURL(
        `${DEV_NETWORK_URL}?device_token=${deviceToken}&push_token=${expoPushToken}`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("Error opening URL:", reason);
      Alert.alert(
        "Error",
        `An error occurred while trying to open the browser: ${reason}`
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚀 Liberdus App Launcher</Text>
      <Text style={styles.subtitle}>
        Tap the button below to open the Liberdus app in your default browser
      </Text>
      <TouchableOpacity style={styles.button} onPress={openBrowser}>
        <Text style={styles.buttonText}>Launch App</Text>
      </TouchableOpacity>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          📱 Platform: {Platform.OS === "ios" ? "iOS" : "Android"}
        </Text>
        <Text style={styles.infoText}>🔗 URL: {DEV_NETWORK_URL}</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f5",
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
    marginBottom: 40,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  button: {
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
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  infoContainer: {
    marginTop: 60,
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
