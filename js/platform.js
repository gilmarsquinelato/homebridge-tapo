const { TapoClient } = require('../index');
const { TapoPlugAccessory } = require('./accessories/plug');
const { TapoLightAccessory } = require('./accessories/light');
const { TapoColorLightAccessory } = require('./accessories/colorLight');
const { TapoPowerStripAccessory } = require('./accessories/powerStrip');

const PLUGIN_NAME = '@gilmarsquinelato/homebridge-tapo';
const PLATFORM_NAME = 'TapoSmartHome';

const DEVICE_TYPE_MAP = {
  Plug: TapoPlugAccessory,
  'Plug with Energy Monitoring': TapoPlugAccessory,
  Light: TapoLightAccessory,
  'Color Light': TapoColorLightAccessory,
  'RGB Light Strip': TapoColorLightAccessory,
  'RGBIC Light Strip': TapoColorLightAccessory,
  'Power Strip': TapoPowerStripAccessory,
  'Power Strip with Energy Monitoring': TapoPowerStripAccessory,
};

// Maps discovery device_type to the TapoClient connect method
const CONNECT_METHOD_MAP = {
  Plug: 'plug',
  'Plug with Energy Monitoring': 'plugEnergyMonitoring',
  Light: 'light',
  'Color Light': 'colorLight',
  'RGB Light Strip': 'colorLight',
  'RGBIC Light Strip': 'colorLight',
  'Power Strip': 'powerStrip',
  'Power Strip with Energy Monitoring': 'powerStrip',
};

class TapoPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessories = new Map();
    this.handlers = new Map();

    if (!config) {
      this.log.warn('No configuration found for TapoSmartHome platform');
      return;
    }

    this.email = config.email;
    this.password = config.password;
    this.broadcastAddress = config.broadcastAddress || '255.255.255.255';
    this.discoveryTimeout = config.discoveryTimeout || 5;
    this.pollingInterval = (config.pollingInterval || 300) * 1000;

    this.client = new TapoClient(this.email, this.password);

    this.api.on('didFinishLaunching', () => {
      this.log.info('Tapo platform finished launching');
      this.discoverDevices();

      this.discoveryTimer = setInterval(() => {
        this.discoverDevices();
      }, this.pollingInterval);
    });

    this.api.on('shutdown', () => {
      if (this.discoveryTimer) {
        clearInterval(this.discoveryTimer);
      }
    });
  }

  configureAccessory(accessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    if (!this.email || !this.password) {
      this.log.error('Email and password are required in the plugin configuration');
      return;
    }

    this.log.info('Starting device discovery...');

    let devices;
    try {
      devices = await this.client.discover(this.broadcastAddress, this.discoveryTimeout);
    } catch (err) {
      this.log.error('Device discovery failed:', err.message);
      return;
    }

    this.log.info('Discovered %d device(s)', devices.length);

    const discoveredUuids = new Set();

    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}-${device.deviceId}`);
      discoveredUuids.add(uuid);

      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.debug('Updating existing accessory: %s (%s)', device.nickname, device.model);
        await this.setupAccessoryHandler(existingAccessory, device);
      } else {
        this.log.info('Adding new accessory: %s (%s) at %s', device.nickname, device.model, device.ip);
        const accessory = new this.api.platformAccessory(
          device.nickname || device.model,
          uuid,
        );
        accessory.context.device = device;
        await this.setupAccessoryHandler(accessory, device);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.set(uuid, accessory);
      }
    }

    // Mark accessories not found in this scan as unreachable, but do NOT
    // unregister them.  Unregistering causes HomeKit to lose room assignments,
    // adaptive-lighting configuration and other user metadata.  The accessories
    // stay cached so they re-activate automatically on the next successful scan.
    for (const [uuid, accessory] of this.accessories) {
      if (!discoveredUuids.has(uuid)) {
        this.log.debug('Device not found in this scan, keeping cached: %s', accessory.displayName);
        this.handlers.delete(uuid);
      }
    }
  }

  async setupAccessoryHandler(accessory, device) {
    const uuid = accessory.UUID;

    // Store device context for cache restoration
    accessory.context.device = device;

    // If handler already exists, just update state
    if (this.handlers.has(uuid)) {
      const handler = this.handlers.get(uuid);
      try {
        await handler.updateState();
      } catch (err) {
        this.log.debug('State update failed for %s, reconnecting: %s', device.nickname, err.message);
        // Reconnect the native transport without recreating the accessory
        // handler.  Recreating would instantiate a new
        // AdaptiveLightingController which resets adaptive-lighting state.
        try {
          const connectMethod = CONNECT_METHOD_MAP[device.deviceType];
          if (connectMethod) {
            handler.nativeHandler = await this.client[connectMethod](device.ip);
            await handler.updateState();
          }
        } catch (reconnectErr) {
          this.log.debug('Reconnect also failed for %s: %s', device.nickname, reconnectErr.message);
        }
      }
      return;
    }

    await this.createHandler(accessory, device);
  }

  async createHandler(accessory, device) {
    const AccessoryClass = DEVICE_TYPE_MAP[device.deviceType];
    if (!AccessoryClass) {
      this.log.warn('Unsupported device type: %s (%s)', device.deviceType, device.model);
      return;
    }

    const connectMethod = CONNECT_METHOD_MAP[device.deviceType];
    if (!connectMethod) {
      this.log.warn('No connect method for device type: %s', device.deviceType);
      return;
    }

    try {
      const nativeHandler = await this.client[connectMethod](device.ip);
      const handler = new AccessoryClass(this, accessory, device, nativeHandler);
      this.handlers.set(accessory.UUID, handler);
      await handler.updateState();
    } catch (err) {
      this.log.error(
        'Failed to connect to %s (%s) at %s: %s',
        device.nickname,
        device.model,
        device.ip,
        err.message,
      );
    }
  }
}

module.exports = { TapoPlatform };
