// Power strips manage child plugs — no single on/off at the strip level.
// This accessory registers as an Outlet but on/off controls are not functional.
// TODO: Implement per-plug child device control.

class TapoPowerStripAccessory {
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
  }

  async updateState() {
    // No per-strip state to update yet
  }
}

module.exports = { TapoPowerStripAccessory };
