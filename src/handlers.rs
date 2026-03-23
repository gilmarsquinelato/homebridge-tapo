use std::sync::Arc;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use tokio::sync::RwLock;

use crate::{runtime, DeviceInfo};

// Helper macro to reduce boilerplate for spawn + await + error mapping
macro_rules! spawn_async {
    ($body:expr) => {{
        runtime()
            .spawn(async move { $body })
            .await
            .map_err(|e| Error::from_reason(format!("Spawn failed: {e}")))?
    }};
}

// ── Plug (P100/P105) ───────────────────────────────────────────────────

#[napi]
pub struct TapoPlug {
    pub(crate) handler: Arc<RwLock<tapo::PlugHandler>>,
}

#[napi]
impl TapoPlug {
    #[napi]
    pub async fn turn_on(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.on().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn turn_off(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.off().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn get_device_info(&self) -> Result<DeviceInfo> {
        let h = self.handler.clone();
        spawn_async!({
            let info = h.read().await.get_device_info().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<DeviceInfo, Error>(DeviceInfo {
                device_id: info.device_id,
                model: info.model,
                device_type: "Plug".to_string(),
                ip: info.ip,
                nickname: info.nickname,
                device_on: info.device_on,
                mac: Some(info.mac),
                fw_ver: Some(info.fw_ver),
                hw_ver: Some(info.hw_ver),
                rssi: Some(info.rssi as i32),
                signal_level: Some(info.signal_level as u32),
                brightness: None,
                hue: None,
                saturation: None,
                color_temp: None,
            })
        })
    }

    #[napi]
    pub async fn refresh_session(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!({
            h.write().await.refresh_session().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<(), Error>(())
        })
    }
}

// ── Plug with Energy Monitoring (P110/P115) ────────────────────────────

#[napi]
pub struct TapoPlugEnergyMonitoring {
    pub(crate) handler: Arc<RwLock<tapo::PlugEnergyMonitoringHandler>>,
}

#[napi]
impl TapoPlugEnergyMonitoring {
    #[napi]
    pub async fn turn_on(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.on().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn turn_off(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.off().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn get_device_info(&self) -> Result<DeviceInfo> {
        let h = self.handler.clone();
        spawn_async!({
            let info = h.read().await.get_device_info().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<DeviceInfo, Error>(DeviceInfo {
                device_id: info.device_id,
                model: info.model,
                device_type: "PlugEnergyMonitoring".to_string(),
                ip: info.ip,
                nickname: info.nickname,
                device_on: info.device_on,
                mac: Some(info.mac),
                fw_ver: Some(info.fw_ver),
                hw_ver: Some(info.hw_ver),
                rssi: Some(info.rssi as i32),
                signal_level: Some(info.signal_level as u32),
                brightness: None,
                hue: None,
                saturation: None,
                color_temp: None,
            })
        })
    }

    #[napi]
    pub async fn refresh_session(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!({
            h.write().await.refresh_session().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<(), Error>(())
        })
    }
}

// ── Light (L510/L520/L610) ─────────────────────────────────────────────

#[napi]
pub struct TapoLight {
    pub(crate) handler: Arc<RwLock<tapo::LightHandler>>,
}

#[napi]
impl TapoLight {
    #[napi]
    pub async fn turn_on(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.on().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn turn_off(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.off().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn set_brightness(&self, brightness: u32) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.set_brightness(brightness as u8).await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn get_device_info(&self) -> Result<DeviceInfo> {
        let h = self.handler.clone();
        spawn_async!({
            let info = h.read().await.get_device_info().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<DeviceInfo, Error>(DeviceInfo {
                device_id: info.device_id,
                model: info.model,
                device_type: "Light".to_string(),
                ip: info.ip,
                nickname: info.nickname,
                device_on: info.device_on,
                mac: Some(info.mac),
                fw_ver: Some(info.fw_ver),
                hw_ver: Some(info.hw_ver),
                rssi: Some(info.rssi as i32),
                signal_level: Some(info.signal_level as u32),
                brightness: Some(info.brightness as u32),
                hue: None,
                saturation: None,
                color_temp: None,
            })
        })
    }

    #[napi]
    pub async fn refresh_session(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!({
            h.write().await.refresh_session().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<(), Error>(())
        })
    }
}

// ── Color Light (L530/L535/L630) ───────────────────────────────────────

#[napi]
pub struct TapoColorLight {
    pub(crate) handler: Arc<RwLock<tapo::ColorLightHandler>>,
}

#[napi]
impl TapoColorLight {
    #[napi]
    pub async fn turn_on(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.on().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn turn_off(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.off().await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn set_brightness(&self, brightness: u32) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.set_brightness(brightness as u8).await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn set_hue_saturation(&self, hue: u32, saturation: u32) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.set_hue_saturation(hue as u16, saturation as u8).await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn set_color_temperature(&self, color_temperature: u32) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!(h.read().await.set_color_temperature(color_temperature as u16).await.map_err(|e| Error::from_reason(e.to_string())))
    }

    #[napi]
    pub async fn get_device_info(&self) -> Result<DeviceInfo> {
        let h = self.handler.clone();
        spawn_async!({
            let info = h.read().await.get_device_info().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<DeviceInfo, Error>(DeviceInfo {
                device_id: info.device_id,
                model: info.model,
                device_type: "ColorLight".to_string(),
                ip: info.ip,
                nickname: info.nickname,
                device_on: info.device_on,
                mac: Some(info.mac),
                fw_ver: Some(info.fw_ver),
                hw_ver: Some(info.hw_ver),
                rssi: Some(info.rssi as i32),
                signal_level: Some(info.signal_level as u32),
                brightness: Some(info.brightness as u32),
                hue: info.hue.map(|h| h as u32),
                saturation: info.saturation.map(|s| s as u32),
                color_temp: Some(info.color_temp as u32),
            })
        })
    }

    #[napi]
    pub async fn refresh_session(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!({
            h.write().await.refresh_session().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<(), Error>(())
        })
    }
}

// ── Power Strip (P300) ─────────────────────────────────────────────────
// Note: PowerStripHandler does NOT have on/off — it manages child plugs.

#[napi]
pub struct TapoPowerStrip {
    pub(crate) handler: Arc<RwLock<tapo::PowerStripHandler>>,
}

#[napi]
impl TapoPowerStrip {
    #[napi]
    pub async fn get_device_info(&self) -> Result<DeviceInfo> {
        let h = self.handler.clone();
        spawn_async!({
            let info = h.read().await.get_device_info().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<DeviceInfo, Error>(DeviceInfo {
                device_id: info.device_id,
                model: info.model,
                device_type: "PowerStrip".to_string(),
                ip: info.ip,
                nickname: "Power Strip".to_string(),
                device_on: false, // Power strips don't have a single on/off state
                mac: Some(info.mac),
                fw_ver: Some(info.fw_ver),
                hw_ver: Some(info.hw_ver),
                rssi: Some(info.rssi as i32),
                signal_level: Some(info.signal_level as u32),
                brightness: None,
                hue: None,
                saturation: None,
                color_temp: None,
            })
        })
    }

    #[napi]
    pub async fn refresh_session(&self) -> Result<()> {
        let h = self.handler.clone();
        spawn_async!({
            h.write().await.refresh_session().await.map_err(|e| Error::from_reason(e.to_string()))?;
            Ok::<(), Error>(())
        })
    }
}
