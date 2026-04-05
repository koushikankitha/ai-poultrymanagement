# ESP32 Render Setup

## What This Master Code Does

- Receives LoRa packets from the slave in `temp:humidity:mq` format
- Sends readings to the hosted backend at `https://ai-poultry-dashboard.onrender.com/api/data`
- Checks the website control mode from `/api/control/state/N1`
- In `manual` mode, uses relay states set from the website
- In `ml` mode, calls `/api/ml/predict` and applies the AI decision locally

## Before Uploading

Replace these values in [esp32_master_render.ino](D:\SSMS-P2(codex)\hardware\esp32_master_render.ino):

- `YOUR_WIFI_NAME`
- `YOUR_WIFI_PASSWORD`
- `NODE_ID` if needed

## Library Requirements

Install these Arduino libraries:

- LoRa
- hd44780
- ArduinoJson

## Relay Mapping Used

- `Relay 1` -> `SPRINKLER` on pin `33`
- `Relay 2` -> `VENT_FAN` on pin `27`
- `HEATER` remains unused in this version

## Important Note

Your current slave code does not send a node id. This master code therefore tags every reading as `N1`.
If you later want multiple LoRa slave nodes, update the slave payload format to include a node id such as:

`N1:35:56:123`

and then update the master parser accordingly.

## Hosting Checklist

1. Make sure backend is live at `https://ai-poultry-dashboard.onrender.com`
2. Make sure frontend is live at `https://ai-poultry-dashboard-1.onrender.com`
3. In the website, select node `N1`
4. Use `ML Analytics` to switch between `Manual` and `ML`
5. In `Manual`, relay buttons directly control the master
6. In `ML`, the master asks the backend for prediction and applies it
