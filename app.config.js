import config from './app.json';
import { AndroidConfig, withAndroidStyles, withPodfile } from '@expo/config-plugins';

class AndroidLaunchScreen {
  static configure(config) {
    return withAndroidStyles(config, AndroidLaunchScreen.setWhiteBackground);
  }

  static setWhiteBackground(config) {
    // The native launch window appears before the React Native loading screen.
    for (const [name, value] of Object.entries({
      'android:windowBackground': '@android:color/white',
      'android:windowSplashScreenBackground': '@android:color/white',
      'android:windowSplashScreenAnimatedIcon': '@android:color/transparent',
    })) {
      config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
        add: true,
        name,
        value,
        parent: { name: 'Theme.App.SplashScreen' },
      });
    }
    return config;
  }
}

/** RN Firebase 26+ uses SPM by default, which breaks iOS static frameworks. */
function withFirebaseDisableSPM(config) {
  return withPodfile(config, (podfileConfig) => {
    const flag = '$RNFirebaseDisableSPM = true';
    if (!podfileConfig.modResults.contents.includes(flag)) {
      podfileConfig.modResults.contents = podfileConfig.modResults.contents.replace(
        /prepare_react_native_project!/,
        `prepare_react_native_project!\n\n${flag}`
      );
    }
    return podfileConfig;
  });
}

export default ({ config: _ }) => {
  const plugins = [
    ...config.expo.plugins,
    withFirebaseDisableSPM,
    AndroidLaunchScreen.configure,
  ];

  // Only add Firebase plugins for Android builds
  if (process.env.EAS_BUILD_PLATFORM === 'android') {
    plugins.push('@react-native-firebase/app');
    plugins.push('@react-native-firebase/messaging');
  }

  return {
    ...config.expo,
    plugins,
  };
};
