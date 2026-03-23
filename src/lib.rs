use std::sync::Arc;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

mod discovery;
mod handlers;

use discovery::run_discovery;

/// Shared runtime for async operations.
fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: std::sync::OnceLock<tokio::runtime::Runtime> = std::sync::OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime")
    })
}

// ── JS-visible data types ──────────────────────────────────────────────

#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub device_id: String,
    pub model: String,
    pub device_type: String,
    pub ip: String,
    pub nickname: String,
    pub device_on: bool,
    pub mac: Option<String>,
    pub fw_ver: Option<String>,
    pub hw_ver: Option<String>,
    pub rssi: Option<i32>,
    pub signal_level: Option<u32>,
    // Light-specific
    pub brightness: Option<u32>,
    pub hue: Option<u32>,
    pub saturation: Option<u32>,
    pub color_temp: Option<u32>,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct DiscoveredDevice {
    pub device_id: String,
    pub model: String,
    pub device_type: String,
    pub ip: String,
    pub nickname: String,
}

// ── TapoClient ─────────────────────────────────────────────────────────

#[napi]
pub struct TapoClient {
    email: String,
    password: String,
}

#[napi]
impl TapoClient {
    #[napi(constructor)]
    pub fn new(email: String, password: String) -> Self {
        Self { email, password }
    }

    /// Discover all Tapo devices on the local network.
    /// `broadcast_addr` defaults to "255.255.255.255" if not provided.
    /// `timeout_secs` defaults to 5 if not provided.
    #[napi]
    pub async fn discover(
        &self,
        broadcast_addr: Option<String>,
        timeout_secs: Option<u32>,
    ) -> Result<Vec<DiscoveredDevice>> {
        let email = self.email.clone();
        let password = self.password.clone();
        let addr = broadcast_addr.unwrap_or_else(|| "255.255.255.255".to_string());
        let timeout = timeout_secs.unwrap_or(5);

        runtime()
            .spawn(async move { run_discovery(&email, &password, &addr, timeout).await })
            .await
            .map_err(|e| Error::from_reason(format!("Discovery task failed: {e}")))?
    }

    /// Connect to a plug device by IP address. Returns a TapoPlug handler.
    #[napi]
    pub async fn plug(&self, ip: String) -> Result<TapoPlug> {
        let email = self.email.clone();
        let password = self.password.clone();
        let handler = runtime()
            .spawn(async move {
                let client = tapo::ApiClient::new(email, password);
                client.p100(ip).await.map_err(|e| Error::from_reason(e.to_string()))
            })
            .await
            .map_err(|e| Error::from_reason(format!("Spawn failed: {e}")))??;

        Ok(TapoPlug {
            handler: Arc::new(RwLock::new(handler)),
        })
    }

    /// Connect to a plug with energy monitoring by IP address.
    #[napi]
    pub async fn plug_energy_monitoring(&self, ip: String) -> Result<TapoPlugEnergyMonitoring> {
        let email = self.email.clone();
        let password = self.password.clone();
        let handler = runtime()
            .spawn(async move {
                let client = tapo::ApiClient::new(email, password);
                client.p110(ip).await.map_err(|e| Error::from_reason(e.to_string()))
            })
            .await
            .map_err(|e| Error::from_reason(format!("Spawn failed: {e}")))??;

        Ok(TapoPlugEnergyMonitoring {
            handler: Arc::new(RwLock::new(handler)),
        })
    }

    /// Connect to a light bulb (L510/L520/L610) by IP address.
    #[napi]
    pub async fn light(&self, ip: String) -> Result<TapoLight> {
        let email = self.email.clone();
        let password = self.password.clone();
        let handler = runtime()
            .spawn(async move {
                let client = tapo::ApiClient::new(email, password);
                client.l510(ip).await.map_err(|e| Error::from_reason(e.to_string()))
            })
            .await
            .map_err(|e| Error::from_reason(format!("Spawn failed: {e}")))??;

        Ok(TapoLight {
            handler: Arc::new(RwLock::new(handler)),
        })
    }

    /// Connect to a color light bulb (L530/L535/L630) by IP address.
    #[napi]
    pub async fn color_light(&self, ip: String) -> Result<TapoColorLight> {
        let email = self.email.clone();
        let password = self.password.clone();
        let handler = runtime()
            .spawn(async move {
                let client = tapo::ApiClient::new(email, password);
                client.l530(ip).await.map_err(|e| Error::from_reason(e.to_string()))
            })
            .await
            .map_err(|e| Error::from_reason(format!("Spawn failed: {e}")))??;

        Ok(TapoColorLight {
            handler: Arc::new(RwLock::new(handler)),
        })
    }

    /// Connect to a power strip (P300) by IP address.
    #[napi]
    pub async fn power_strip(&self, ip: String) -> Result<TapoPowerStrip> {
        let email = self.email.clone();
        let password = self.password.clone();
        let handler = runtime()
            .spawn(async move {
                let client = tapo::ApiClient::new(email, password);
                client.p300(ip).await.map_err(|e| Error::from_reason(e.to_string()))
            })
            .await
            .map_err(|e| Error::from_reason(format!("Spawn failed: {e}")))??;

        Ok(TapoPowerStrip {
            handler: Arc::new(RwLock::new(handler)),
        })
    }
}

// ── Device Handlers (re-exported from handlers module) ─────────────────

pub use handlers::*;
