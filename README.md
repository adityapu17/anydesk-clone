# AnyDesk Clone — Remote Desktop tanpa timeout

Aplikasi remote desktop berbasis WebRTC seperti AnyDesk, **tanpa batasan free plan** — tidak ada session timeout, tidak ada limit durasi, tidak ada limit client.

## Fitur

- 🚀 Screen sharing Full HD (1920x1080) via WebRTC P2P
- 🖱️ Mouse & keyboard kontrol real-time
- 📱 Viewer bisa pakai Android/iOS (touch support)
- 🔒 End-to-end encrypted WebRTC
- ⚡ Low latency, koneksi P2P langsung
- 🆓 No free plan timeout — session live sampai host memberhentikan
- 👥 Multiple viewers per session

## Cara Pakai

### Host (harus desktop)
1. Buka `http://localhost:3000/` di Chrome/Firefox/Edge desktop
2. Klik **Start Hosting** → pilih layar/jendela yang mau dishare
3. Dapatkan **Session ID** → bagikan ke viewer

### Viewer (Android/iOS/desktop)
1. Buka `http://<IP-DESKTOP>:3000/` di browser HP
2. Klik **Connect to Session** → masukkan Session ID → **Connect**
3. Geser/tekan di layar = kontrol mouse & keyboard di host

## Jalankan di Localhost

```bash
npm install
npm start
# Server jalan di http://localhost:3000
```

## Akses dari HP (same WiFi)

Ganti `localhost` dengan IP lokal desktop. Cek IP:
```bash
# Windows
ipconfig
# Linux/macOS
ifconfig | grep "inet "
```

Lalu buka `http://<IP-LAN>:3000/` di HP.

## Deploy ke Cloud (akses dari mana saja)

```bash
# Contoh deploy ke server VPS
git clone <repo>
cd anydesk-clone
npm install
node server.js
# Expose port 3000
```

## File

| File | Deskripsi |
|------|-----------|
| `server.js` | WebSocket signaling server + static file server |
| `public/index.html` | Landing page |
| `public/host.html` | Host screen |
| `public/client.html` | Viewer/connect page (mobile-friendly) |
| `public/app.js` | WebRTC logic + touch/mouse input handling |

## Teknologi

- **Backend**: Node.js + Express + ws (WebSocket)
- **Frontend**: Vanilla JS, WebRTC, getDisplayMedia
- **Signaling**: WebSocket
- **Media**: WebRTC P2P (STUN: Google public STUN servers)
