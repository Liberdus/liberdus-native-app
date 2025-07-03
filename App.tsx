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
const SUBSCRIPTION_API = "http://192.168.1.91:3001/subscribe";

const DEVICE_TOKEN_KEY = "device_token";

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

  useEffect(() => {
    (async () => {
      const token = await getOrCreateDeviceToken();
      console.log("📱 Device Token:", token);
      setDeviceToken(token);

      await registerForPushNotificationsAsync(token);
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
      console.error("❌ Failed to subscribe:", error);
      Alert.alert("Error", "Failed to subscribe to notification server");
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
        ],
      };

      const response = await axios.post(SUBSCRIPTION_API, payload);
      console.log("✅ Subscribed to notification server:", response.data);
    } catch (error) {
      console.error("❌ Failed to subscribe:", error);
      Alert.alert("Error", "Failed to subscribe to notification server");
    }
  };

  const openBrowser = async () => {
    try {
      await Linking.openURL(
        `${DEV_NETWORK_URL}?device_id=${deviceToken}&push_token=${expoPushToken}`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      Alert.alert(
        "Error",
        `An error occurred while trying to open the browser: ${reason}`
      );
      console.error("Error opening URL:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚀 Liberdus App Launcher</Text>
      <Text style={styles.subtitle}>
        Tap the button below to open the Liberdus app in your default browser
      </Text>
      <TouchableOpacity style={styles.button} onPress={openBrowser}>
        <Text style={styles.buttonText}>Launch Dev App</Text>
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
});

export default App;
