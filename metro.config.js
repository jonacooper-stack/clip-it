// Default Expo Metro config. Expo's config supports tsconfig `paths`
// (the `@/*` alias) out of the box.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
