module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must stay last — Reanimated's plugin has to run after every other transform.
    plugins: ['react-native-reanimated/plugin'],
  };
};
