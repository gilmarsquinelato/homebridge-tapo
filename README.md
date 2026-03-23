# homebridge-tapo

Homebridge plugin for TP-Link Tapo smart devices, powered by native Rust bindings to the [tapo](https://github.com/mihai-dinculescu/tapo) crate. Runs as a child bridge for isolation and stability.

Devices are **automatically discovered** on your local network — no manual IP configuration required.

## Supported Devices

- **Plugs** (P100, P105) — on/off control
- **Plugs with Energy Monitoring** (P110, P110M, P115) — on/off control
- **Light Bulbs** (L510, L520, L610) — on/off, brightness
- **Color Light Bulbs** (L530, L535, L630) — on/off, brightness, hue, saturation, color temperature
- **Light Strips** (L900, L920, L930) — same as color bulbs
- **Power Strips** (P300, P304M, P306, P316M) — on/off control
- **Hubs** (H100) — detected but not yet controllable

## Installation

```bash
npm install -g homebridge-tapo
```

Or install via the Homebridge UI. Requires Rust toolchain for building native bindings.

## Configuration

Add the following to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "TapoSmartHome",
      "name": "Tapo Smart Home",
      "email": "your-tplink-email@example.com",
      "password": "your-tplink-password",
      "_bridge": {
        "username": "0E:83:FD:29:58:C9",
        "port": 55197
      }
    }
  ]
}
```

### Child Bridge

To run as a child bridge (recommended), add the `_bridge` section with a unique `username` (MAC format) and `port`. This isolates the plugin in its own process.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `email` | — | TP-Link account email (required) |
| `password` | — | TP-Link account password (required) |
| `broadcastAddress` | `255.255.255.255` | Network broadcast address for discovery |
| `discoveryTimeout` | `5` | Seconds to wait for device responses |
| `pollingInterval` | `300` | Seconds between discovery/state polls |

## Building from Source

Requires Rust toolchain (`rustup`) and Node.js >= 18.

```bash
npm install
npm run build
```
