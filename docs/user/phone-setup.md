# Use Leonidas Code on your phone

Your computer runs the AI. Your phone is a remote control. The computer must stay on.
Setup takes about 10 minutes. You need the free Tailscale app on both devices.

## On your computer

1. Install Tailscale from https://tailscale.com/download. Sign in. Keep the same account for step 5.
2. Open Leonidas Code. Go to **Settings**, then **Sharing and access**.
3. Turn on **Network access**. The app restarts.
4. Turn on **Tailscale HTTPS**.
5. Click **Create link**. Keep this page open until the phone is paired. The link works one time only.

## On your phone

1. Install Tailscale from the App Store. Sign in with the same account as the computer.
2. Scan the QR code from step 5 with the phone camera, or send the link to yourself and tap it.
3. Open the link in Safari. Tap **Share**, then **Add to Home Screen**.

Done. Open the new icon to use Leonidas Code.

## If it does not work

- **The link opens another app first:** the code is now used. Click **Create link** again. Open the new link in Safari.
- **The page does not load:** check that Tailscale shows "Connected" on both devices. Check that the computer is awake.
- **Tailscale HTTPS is off or shows an error:** open https://login.tailscale.com/admin/dns, then turn on **HTTPS Certificates**. Turn **Tailscale HTTPS** off and on again in the app.
- **The phone worked, then stopped:** the computer went to sleep. In Windows, set **Settings, System, Power, Sleep** to **Never** while plugged in.

Treat the link and the code as a password. Do not share them.
