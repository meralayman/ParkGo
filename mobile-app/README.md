# ParkGo Mobile (Expo React Native)

This is the **mobile client** for ParkGo. It connects to the **same Express backend** and **same PostgreSQL database** (no DB duplication).

## Requirements

- Node.js 18+ recommended
- Expo Go on your phone, or Android Studio emulator
- ParkGo backend running (default `http://localhost:5000`)

## Configure API Base URL

Expo uses **public env vars**:

1. Create `mobile-app/.env`:

```
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5000
```

- **Android emulator**: use `http://10.0.2.2:5000`
- **Real phone**: use your PC LAN IP, e.g. `http://192.168.1.10:5000`
- **iOS simulator (macOS)**: usually `http://localhost:5000`

Important:
- `http://10.0.2.2:5000` works **only** on an Android emulator.
- On a real phone, you **must** use your computer’s LAN IP (and ensure Windows Firewall allows inbound on port 5000).
- After editing `.env`, restart Expo with cache clear: `npx expo start -c`

## Install

```bash
cd mobile-app
npm install
```

## Run

```bash
cd mobile-app
npx expo start
```

Then:

- Press `a` to open Android emulator, or
- Scan the QR with **Expo Go** on your phone

### If you specifically want a QR in the terminal (recommended for phones)

Use the tunnel mode (it prints a QR you can scan from your PC screen):

```bash
cd mobile-app
npm run start:tunnel
```

If the QR still doesn’t show, run:

```bash
cd mobile-app
npx expo start --tunnel
```

Notes:
- Tunnel mode uses `@expo/ngrok` (already added to this project as a dev dependency).
- Make sure you run the command in your own terminal (interactive). Expo prints the QR in the terminal output.

## Features implemented

- Auth: login/register, secure token storage (`expo-secure-store`), auto refresh (`/auth/refresh`), logout
- User: dashboard (slot-based status + forecast), booking (slot + date/time/duration), QR screen, booking history
- Gatekeeper: QR scanner (`/gate/qr/preview`), check-in/check-out
- Admin: stats (`/admin/analytics`) and logs (`/admin/logs`)

## Notes

- QR codes are displayed from the backend-signed token (`reservation.qrJwt`). The app **does not generate QR data**.
- If you want Forecast to show data, start the Flask service too (your web README covers it). The mobile app calls `GET /api/forecast` on Express.

