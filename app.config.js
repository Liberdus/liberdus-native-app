import config from './app.json';

export default ({ config: _ }) => {
  const plugins = [...config.expo.plugins];
  
  // Only add Firebase plugin for Android builds
  if (process.env.EAS_BUILD_PLATFORM === 'android') {
    plugins.push('@react-native-firebase/app');
  }

  return {
    ...config.expo,
    plugins,
  };
};