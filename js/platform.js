const { TapoClient } = require('../index');
const { TapoPlugAccessory } = require('./accessories/plug');
const { TapoLightAccessory } = require('./accessories/light');
const { TapoColorLightAccessory } = require('./accessories/colorLight');
const { TapoPowerStripAccessory } = require('./accessories/powerStrip');

const PLUGIN_NAME = '@gilmarsquinelato/homebridge-tapo';
const PLATFORM_NAME = 'TapoSmartHome';

const DEFAULT_DISCOVERY_INTERVAL = 300;
const DEFAULT_STATE_INTERVAL = 10;
const MIN_STATE_INTERVAL = 3;

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
    this.statePollInFlight = false;

    if (!config) {
      this.log.warn('No configuration found for TapoSmartHome platform');
      return;
    }

    this.email = config.email;
    this.password = config.password;
    this.broadcastAddress = config.broadcastAddress || '255.255.255.255';
    this.discoveryTimeout = config.discoveryTimeout || 10;
    // Discovery is a slow UDP broadcast — it only needs to run often enough
    // to notice new or relocated devices.
    this.discoveryInterval = (config.pollingInterval || DEFAULT_DISCOVERY_INTERVAL) * 1000;
    // State polling talks to each known device directly and is what keeps
    // HomeKit in sync with changes made outside of it (app, wall switch).
    this.stateInterval =
      Math.max(MIN_STATE_INTERVAL, config.stateInterval || DEFAULT_STATE_INTERVAL) * 1000;

    this.client = new TapoClient(this.email, this.password);

    this.api.on('didFinishLaunching', async () => {
      this.log.info('Tapo platform finished launching');
      await this.discoverDevices();

      this.discoveryTimer = setInterval(() => {
        this.discoverDevices();
      }, this.discoveryInterval);

      this.log.info('Polling device state every %d seconds', this.stateInterval / 1000);
      this.stateTimer = setInterval(() => {
        this.pollStates();
      }, this.stateInterval);
    });

    this.api.on('shutdown', () => {
      if (this.discoveryTimer) {
        clearInterval(this.discoveryTimer);
      }
      if (this.stateTimer) {
        clearInterval(this.stateTimer);
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

    // Devices that didn't answer this broadcast are NOT removed.  UDP
    // discovery is lossy and a single missed beacon doesn't mean the device
    // is gone — keep the existing handler so HomeKit can still talk to it,
    // and so the state poller keeps refreshing it over TCP.
    for (const [uuid, accessory] of this.accessories) {
      if (!discoveredUuids.has(uuid)) {
        this.log.debug('Device not seen in this scan, keeping handler: %s', accessory.displayName);
      }
    }
  }

  async setupAccessoryHandler(accessory, device) {
    const uuid = accessory.UUID;

    accessory.context.device = device;

    // If a handler already exists, reuse it so the AdaptiveLightingController
    // and other characteristic state survive.  Discovery only keeps the
    // addressing information current — refreshing state is the poller's job.
    if (this.handlers.has(uuid)) {
      const handler = this.handlers.get(uuid);
      const previousIp = handler.device && handler.device.ip;
      handler.device = device;

      if (previousIp && previousIp !== device.ip) {
        this.log.info(
          '%s moved from %s to %s, reconnecting',
          device.nickname,
          previousIp,
          device.ip,
        );
        try {
          await this.reconnectAccessory(uuid);
        } catch (err) {
          this.log.debug('Reconnect after IP change failed for %s: %s', device.nickname, err.message);
        }
      }
      return;
    }

    await this.createHandler(accessory, device);
  }

  // Refresh every known accessory directly over TCP.  This is independent of
  // discovery: a device that missed the last UDP broadcast is still polled,
  // and one that was power-cycled gets a fresh session on the retry.
  async pollStates() {
    if (this.statePollInFlight) {
      this.log.debug('Previous state poll still running, skipping this tick');
      return;
    }

    this.statePollInFlight = true;
    try {
      await Promise.allSettled(
        [...this.handlers.keys()].map((uuid) => this.refreshAccessoryState(uuid)),
      );
    } finally {
      this.statePollInFlight = false;
    }
  }

  async refreshAccessoryState(uuid) {
    const handler = this.handlers.get(uuid);
    if (!handler) {
      return;
    }

    const name = handler.device ? handler.device.nickname : uuid;

    try {
      await handler.updateState();
    } catch (err) {
      this.log.debug('State poll failed for %s, reconnecting: %s', name, err.message);
      try {
        await this.reconnectAccessory(uuid);
        await handler.updateState();
        this.log.info('Recovered connection to %s', name);
      } catch (retryErr) {
        this.log.debug('State poll retry failed for %s: %s', name, retryErr.message);
      }
    }
  }

  // Replace the underlying native transport for an existing accessory
  // handler.  Used both by the state poller (when a poll fails) and on
  // demand from an accessory after a setter/getter throws.
  async reconnectAccessory(uuid) {
    const handler = this.handlers.get(uuid);
    if (!handler) {
      return null;
    }
    const device = handler.device;
    const connectMethod = CONNECT_METHOD_MAP[device.deviceType];
    if (!connectMethod) {
      return null;
    }
    const nativeHandler = await this.client[connectMethod](device.ip);
    handler.nativeHandler = nativeHandler;
    if (typeof handler.onReconnect === 'function') {
      handler.onReconnect();
    }
    return nativeHandler;
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
      await this.refreshAccessoryState(accessory.UUID);
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
