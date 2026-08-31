// Metro does not need this file; jest does. Without babel-preset-expo every
// suite dies with "Must use import to load ES Module".
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
