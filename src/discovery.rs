use napi::bindgen_prelude::*;
use tokio_stream::StreamExt;

use crate::DiscoveredDevice;

pub async fn run_discovery(
    email: &str,
    password: &str,
    broadcast_addr: &str,
    timeout_secs: u32,
) -> Result<Vec<DiscoveredDevice>> {
    let client = tapo::ApiClient::new(email, password);

    let mut stream = client
        .discover_devices(broadcast_addr, timeout_secs as u64)
        .await
        .map_err(|e| Error::from_reason(format!("Discovery failed: {e}")))?;

    let mut devices = Vec::new();

    while let Some(result) = stream.next().await {
        match result {
            Ok(device) => {
                devices.push(DiscoveredDevice {
                    device_id: device.device_id().to_string(),
                    model: device.model().to_string(),
                    device_type: device.device_type().to_string(),
                    ip: device.ip().to_string(),
                    nickname: device.nickname().to_string(),
                });
            }
            Err(e) => {
                log::warn!("Discovery error for device at {}: {}", e.ip, e.source);
            }
        }
    }

    Ok(devices)
}
