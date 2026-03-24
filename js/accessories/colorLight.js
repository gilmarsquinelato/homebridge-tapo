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

    // Enable Adaptive Lighting — HAP-NodeJS handles the 24-hour color
    // temperature transitions automatically, calling our setColorTemperature
    // handler as needed.
    this.adaptiveLightingController = new this.api.hap.AdaptiveLightingController(this.service, {
      controllerMode: this.api.hap.AdaptiveLightingControllerMode.AUTOMATIC,
    });
    this.accessory.configureController(this.adaptiveLightingController);
  }

  async getOn() {
    try {
      const info = await this.nativeHandler.getDeviceInfo();
      return info.deviceOn;
    } catch {
      return false;
    }
  }

  async setOn(value) {
    try {
      if (value) {
        await this.nativeHandler.turnOn();
      } else {
        await this.nativeHandler.turnOff();
      }
    } catch (err) {
      this.log.error('Failed to set power for %s: %s', this.device.nickname, err.message);
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async getBrightness() {
    try {
      const info = await this.nativeHandler.getDeviceInfo();
      return info.brightness || 0;
    } catch {
      return 0;
    }
  }

  async setBrightness(value) {
    try {
      await this.nativeHandler.setBrightness(value);
    } catch (err) {
      this.log.error('Failed to set brightness for %s: %s', this.device.nickname, err.message);
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async getHue() {
    try {
      const info = await this.nativeHandler.getDeviceInfo();
      return info.hue || 0;
    } catch {
      return 0;
    }
  }

  async setHue(value) {
    this.pendingHue = value;
    this.scheduleColorUpdate();
  }

  async getSaturation() {
    try {
      const info = await this.nativeHandler.getDeviceInfo();
      return info.saturation || 0;
    } catch {
      return 0;
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
        try {
          await this.nativeHandler.setHueSaturation(this.pendingHue, this.pendingSaturation);
        } catch (err) {
          this.log.error('Failed to set color for %s: %s', this.device.nickname, err.message);
        }
        this.pendingHue = null;
        this.pendingSaturation = null;
      }
    }, 100);
  }

  async getColorTemperature() {
    try {
      const info = await this.nativeHandler.getDeviceInfo();
      if (info.colorTemp && info.colorTemp > 0) {
        return Math.round(1000000 / info.colorTemp);
      }
      return 140;
    } catch {
      return 140;
    }
  }

  async setColorTemperature(mireds) {
    try {
      const kelvin = Math.max(2500, Math.min(6500, Math.round(1000000 / mireds)));
      await this.nativeHandler.setColorTemperature(kelvin);
    } catch (err) {
      this.log.error('Failed to set color temp for %s: %s', this.device.nickname, err.message);
      throw new this.api.hap.HapStatusError(
        this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async updateState() {
    try {
      const info = await this.nativeHandler.getDeviceInfo();
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
