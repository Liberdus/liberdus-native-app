import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import * as Linking from "expo-linking";

const App: React.FC = () => {
  // Replace with your dev network URL
  const DEV_NETWORK_URL: string = "https://liberdus.com/dev/";

  const openBrowser = async (): Promise<void> => {
    try {
      // `Linking.canOpenURL` sometimes fails on some Android devices, so updated to use `Linking.openURL` directly
      // const supported = await Linking.canOpenURL(DEV_NETWORK_URL);

      // if (supported) {
      //   await Linking.openURL(DEV_NETWORK_URL);
      // } else {
      //   Alert.alert(
      //     "Error",
      //     "Unable to open the URL. Please check if you have a browser installed."
      //   );
      // }
      await Linking.openURL(DEV_NETWORK_URL);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      Alert.alert(
        "Error",
        `An error occurred while trying to open the browser: ${reason}`,

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
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    textAlign: "center",
  },
  noteText: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 10,
    maxWidth: 250,
  },
});

export default App;
