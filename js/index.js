const { TapoPlatform } = require('./platform');

const PLUGIN_NAME = 'homebridge-tapo';
const PLATFORM_NAME = 'TapoSmartHome';

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TapoPlatform);
};
