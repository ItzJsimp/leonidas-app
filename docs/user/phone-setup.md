# Use Leonidas on your phone

Your computer runs the AI. Your phone is a remote control. The computer must stay on.
Setup takes about 10 minutes. You need the free Tailscale app on both devices.

## On your computer

1. Install Tailscale from https://tailscale.com/download. Sign in. Keep the same account for step 5.
2. Open Leonidas. Go to **Settings**, then **Sharing and access**.
3. Turn on **Network access**. The app restarts.
4. Turn on **Tailscale HTTPS**.
5. Click **Create link**. Keep this page open until the phone is paired. The link works one time only.

## On your phone

1. Install Tailscale from the App Store. Sign in with the same account as the computer.
2. Scan the QR code from step 5 with the phone camera, or send the link to yourself and tap it.
3. Open the link in Safari. Tap **Share**, then **Add to Home Screen**.

Done. Open the new icon to use Leonidas.

## If your computer is a Mac

The phone steps do not change. On the computer, do these things first:

1. Use an Apple Silicon Mac (M1 or newer). Intel Macs have no build.
2. Download https://github.com/ItzJsimp/leonidas-code/releases/latest/download/Leonidas-Setup-mac.dmg. Drag **Leonidas** to Applications.
3. Open the app. If macOS blocks it, go to **System Settings, Privacy & Security** and click **Open Anyway**.
4. If macOS says the app "is damaged", run this once in Terminal, then open the app again: `xattr -dr com.apple.quarantine "/Applications/Leonidas.app"`
5. Install Tailscale on the Mac from https://tailscale.com/download. Then follow "On your computer" above.
6. To keep the Mac awake: **System Settings, Battery** (or **Energy**), then turn on **Prevent automatic sleeping when the display is off**.

The Mac app does not update itself. Download the .dmg again for each new version.

## If it does not work

- **The link opens another app first:** the code is now used. Click **Create link** again. Open the new link in Safari.
- **The page does not load:** check that Tailscale shows "Connected" on both devices. Check that the computer is awake.
- **Tailscale HTTPS is off or shows an error:** open https://login.tailscale.com/admin/dns, then turn on **HTTPS Certificates**. Turn **Tailscale HTTPS** off and on again in the app.
- **The phone worked, then stopped:** the computer went to sleep. In Windows, set **Settings, System, Power, Sleep** to **Never** while plugged in.

Treat the link and the code as a password. Do not share them.
