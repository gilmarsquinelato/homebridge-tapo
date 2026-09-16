const { createInfoCache, WRITE_SETTLE_MS } = require('../infoCache');

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

  // Push a value to HomeKit only when it actually changed, so the state
  // poller doesn't emit a change event on every tick.
  _push(characteristic, value) {
    const current = this.service.getCharacteristic(characteristic).value;
    if (current !== value) {
      this.service.updateCharacteristic(characteristic, value);
    }
  }

  // Called by the platform's state poller.  Throws on a failed read so the
  // platform can reconnect and retry against a fresh session.
  async updateState() {
    // A write we just made may not be reflected by the device yet; let it
    // settle rather than bouncing the characteristic back in the Home app.
    if (this.infoCache.sinceWrite() < WRITE_SETTLE_MS) {
      return;
    }

    this.infoCache.invalidate();
    const info = await this.infoCache.get();
    this._push(this.api.hap.Characteristic.On, info.deviceOn);
  }
}

module.exports = { TapoPlugAccessory };
