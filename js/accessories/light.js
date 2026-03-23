class TapoLightAccessory {
  constructor(platform, accessory, device, nativeHandler) {
    this.platform = platform;
    this.accessory = accessory;
    this.device = device;
    this.nativeHandler = nativeHandler;
    this.log = platform.log;
    this.api = platform.api;

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

  async updateState() {
    try {
      const info = await this.nativeHandler.getDeviceInfo();
      this.service.updateCharacteristic(this.api.hap.Characteristic.On, info.deviceOn);
      this.service.updateCharacteristic(this.api.hap.Characteristic.Brightness, info.brightness || 0);
    } catch (err) {
      this.log.debug('Failed to update state for %s: %s', this.device.nickname, err.message);
    }
  }
}

module.exports = { TapoLightAccessory };
