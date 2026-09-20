module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxRuntime: 'automatic' }]],
    // react-native-worklets powers Reanimated; its plugin must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
