import React, { useRef, useEffect } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";

const AnimatedSplash = () => {
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    scale.setValue(0.3); // start smaller
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.2, // grow bigger than normal
        duration: 4000,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1, // shrink to normal size
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require("./assets/logo.png")}
        style={[
          styles.icon,
          {
            transform: [{ scale }],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fa",
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    width: 150,
    height: 150,
  },
});

export default AnimatedSplash;
