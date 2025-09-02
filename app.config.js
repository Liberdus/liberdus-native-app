import config from './app.json';

export default ({ config: _ }) => {
  const plugins = [...config.expo.plugins];

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