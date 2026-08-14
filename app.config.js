import config from './app.json';
import { withPodfile } from '@expo/config-plugins';

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
  const plugins = [...config.expo.plugins, withFirebaseDisableSPM];

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