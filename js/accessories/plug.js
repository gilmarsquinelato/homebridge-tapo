const { createInfoCache } = require('../infoCache');

class TapoPlugAccessory {
  constructor(platform, accessory, device, nativeHandler) {
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.nativeHandler = nativeHandler;
    this.log = platform.log;
    this.api = platform.api;

    this.infoCache = createInfoCache(() => this.nativeHandler.getDeviceInfo());

    const infoService =
      this.accessory.getService(this.api.hap.Service.AccessoryInformation) ||
      this.accessory.addService(this.api.hap.Service.AccessoryInformation);

    infoService
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'TP-Link')
      .setCharacteristic(this.api.hap.Characteristic.Model, device.model)
      .setCharacteristic(this.api.hap.Characteristic.SerialNumber, device.deviceId);

    this.service =
      this.accessory.getService(this.api.hap.Service.Outlet) ||
      this.accessory.addService(this.api.hap.Service.Outlet);

    this.service.setCharacteristic(
      this.api.hap.Characteristic.Name,
      device.nickname || device.model,
    );

    this.service
      .getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => this.getOn())
      .onSet((value) => this.setOn(value));
  }

  onReconnect() {
    this.infoCache.invalidate();
  }

  async getOn() {
    try {
      const info = await this.infoCache.get();
      return info.deviceOn;
    } catch (err) {
      this.log.debug('getOn failed for %s: %s', this.device.nickname, err.message);
      const last = this.infoCache.peek();
      return last ? last.deviceOn : false;
    }
  }

  async setOn(value) {
    try {
      if (value) {
        await this.nativeHandler.turnOn();
      } else {
        await this.nativeHandler.turnOff();
      }
      this.infoCache.patch({ deviceOn: value });
    } catch (err) {
      this.log.debug('setOn failed for %s, reconnecting: %s', this.device.nickname, err.message);
      try {
        await this.platform.reconnectAccessory(this.accessory.UUID);
        if (value) {
          await this.nativeHandler.turnOn();
        } else {
          await this.nativeHandler.turnOff();
        }
        this.infoCache.patch({ deviceOn: value });
      } catch (retryErr) {
        this.log.error('setOn retry failed for %s: %s', this.device.nickname, retryErr.message);
      }
    }
  }

  async updateState() {
    try {
      this.infoCache.invalidate();
      const info = await this.infoCache.get();
      this.service.updateCharacteristic(
        this.api.hap.Characteristic.On,
        info.deviceOn,
      );
    } catch (err) {
      this.log.debug('Failed to update state for %s: %s', this.device.nickname, err.message);
    }
  }
}

module.exports = { TapoPlugAccessory };
