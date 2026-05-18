const { createInfoCache } = require('../infoCache');

class TapoColorLightAccessory {
  constructor(platform, accessory, device, nativeHandler) {
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.nativeHandler = nativeHandler;
    this.log = platform.log;
    this.api = platform.api;

    this.pendingHue = null;
    this.pendingSaturation = null;
    this.colorUpdateTimer = null;

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

    this.service
      .getCharacteristic(this.api.hap.Characteristic.Hue)
      .onGet(() => this.getHue())
      .onSet((value) => this.setHue(value));

    this.service
      .getCharacteristic(this.api.hap.Characteristic.Saturation)
      .onGet(() => this.getSaturation())
      .onSet((value) => this.setSaturation(value));

    this.service
      .getCharacteristic(this.api.hap.Characteristic.ColorTemperature)
      .onGet(() => this.getColorTemperature())
      .onSet((value) => this.setColorTemperature(value));

    this.adaptiveLightingController = new this.api.hap.AdaptiveLightingController(this.service, {
      controllerMode: this.api.hap.AdaptiveLightingControllerMode.AUTOMATIC,
    });
    this.accessory.configureController(this.adaptiveLightingController);
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

  async getHue() {
    try {
      const info = await this.infoCache.get();
      return info.hue || 0;
    } catch (err) {
      this.log.debug('getHue failed for %s: %s', this.device.nickname, err.message);
      const last = this.infoCache.peek();
      return last ? last.hue || 0 : 0;
    }
  }

  async setHue(value) {
    this.pendingHue = value;
    this.scheduleColorUpdate();
  }

  async getSaturation() {
    try {
      const info = await this.infoCache.get();
      return info.saturation || 0;
    } catch (err) {
      this.log.debug('getSaturation failed for %s: %s', this.device.nickname, err.message);
      const last = this.infoCache.peek();
      return last ? last.saturation || 0 : 0;
    }
  }

  async setSaturation(value) {
    this.pendingSaturation = value;
    this.scheduleColorUpdate();
  }

  scheduleColorUpdate() {
    if (this.colorUpdateTimer) {
      clearTimeout(this.colorUpdateTimer);
    }

    this.colorUpdateTimer = setTimeout(async () => {
      if (this.pendingHue !== null && this.pendingSaturation !== null) {
        const hue = this.pendingHue;
        const saturation = this.pendingSaturation;
        this.pendingHue = null;
        this.pendingSaturation = null;
        const ok = await this._runWithReconnect('setHueSaturation', async () => {
          await this.nativeHandler.setHueSaturation(hue, saturation);
        });
        if (ok) {
          this.infoCache.patch({ hue, saturation });
        }
      }
    }, 100);
  }

  async getColorTemperature() {
    try {
      const info = await this.infoCache.get();
      if (info.colorTemp && info.colorTemp > 0) {
        return Math.round(1000000 / info.colorTemp);
      }
      return 140;
    } catch (err) {
      this.log.debug('getColorTemperature failed for %s: %s', this.device.nickname, err.message);
      const last = this.infoCache.peek();
      if (last && last.colorTemp && last.colorTemp > 0) {
        return Math.round(1000000 / last.colorTemp);
      }
      return 140;
    }
  }

  async setColorTemperature(mireds) {
    // Tapo's setColorTemperature implicitly turns the light on; skip while
    // off so Adaptive Lighting doesn't wake the device.
    const isOn = this.service.getCharacteristic(this.api.hap.Characteristic.On).value;
    if (!isOn) {
      return;
    }
    const kelvin = Math.max(2500, Math.min(6500, Math.round(1000000 / mireds)));
    const ok = await this._runWithReconnect('setColorTemperature', async () => {
      await this.nativeHandler.setColorTemperature(kelvin);
    });
    if (ok) {
      this.infoCache.patch({ colorTemp: kelvin });
    }
  }

  async updateState() {
    try {
      this.infoCache.invalidate();
      const info = await this.infoCache.get();
      this.service.updateCharacteristic(this.api.hap.Characteristic.On, info.deviceOn);
      this.service.updateCharacteristic(this.api.hap.Characteristic.Brightness, info.brightness || 0);
      this.service.updateCharacteristic(this.api.hap.Characteristic.Hue, info.hue || 0);
      this.service.updateCharacteristic(this.api.hap.Characteristic.Saturation, info.saturation || 0);
      if (info.colorTemp && info.colorTemp > 0) {
        this.service.updateCharacteristic(
          this.api.hap.Characteristic.ColorTemperature,
          Math.round(1000000 / info.colorTemp),
        );
      }
    } catch (err) {
      this.log.debug('Failed to update state for %s: %s', this.device.nickname, err.message);
    }
  }
}

module.exports = { TapoColorLightAccessory };
