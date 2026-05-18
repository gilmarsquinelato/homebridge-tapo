const { createInfoCache } = require('../infoCache');

class TapoLightAccessory {
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
      this.accessory.getService(this.api.hap.Service.Lightbulb) ||
      this.accessory.addService(this.api.hap.Service.Lightbulb);

    this.service.setCharacteristic(
      this.api.hap.Characteristic.Name,
      device.nickname || device.model,
    );

    this.service
      .getCharacteristic(this.api.hap.Characteristic.On)
      .onGet(() => this.getOn())
      .onSet((value) => this.setOn(value));

    this.service
      .getCharacteristic(this.api.hap.Characteristic.Brightness)
      .onGet(() => this.getBrightness())
      .onSet((value) => this.setBrightness(value));
  }

  onReconnect() {
    this.infoCache.invalidate();
  }

  async _runWithReconnect(label, op) {
    try {
      await op();
      return true;
    } catch (err) {
      this.log.debug('%s failed for %s, reconnecting: %s', label, this.device.nickname, err.message);
      try {
        await this.platform.reconnectAccessory(this.accessory.UUID);
        await op();
        return true;
      } catch (retryErr) {
        this.log.error('%s retry failed for %s: %s', label, this.device.nickname, retryErr.message);
        return false;
      }
    }
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
    const ok = await this._runWithReconnect('setOn', async () => {
      if (value) {
        await this.nativeHandler.turnOn();
      } else {
        await this.nativeHandler.turnOff();
      }
    });
    if (ok) {
      this.infoCache.patch({ deviceOn: value });
    }
  }

  async getBrightness() {
    try {
      const info = await this.infoCache.get();
      return info.brightness || 0;
    } catch (err) {
      this.log.debug('getBrightness failed for %s: %s', this.device.nickname, err.message);
      const last = this.infoCache.peek();
      return last ? last.brightness || 0 : 0;
    }
  }

  async setBrightness(value) {
    const ok = await this._runWithReconnect('setBrightness', async () => {
      await this.nativeHandler.setBrightness(value);
    });
    if (ok) {
      this.infoCache.patch({ brightness: value });
    }
  }

  async updateState() {
    try {
      this.infoCache.invalidate();
      const info = await this.infoCache.get();
      this.service.updateCharacteristic(this.api.hap.Characteristic.On, info.deviceOn);
      this.service.updateCharacteristic(this.api.hap.Characteristic.Brightness, info.brightness || 0);
    } catch (err) {
      this.log.debug('Failed to update state for %s: %s', this.device.nickname, err.message);
    }
  }
}

module.exports = { TapoLightAccessory };
