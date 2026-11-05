const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo configures Metro for monorepos automatically (SDK 52+); only NativeWind is added here.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
