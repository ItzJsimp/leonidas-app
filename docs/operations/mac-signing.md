# Mac signing for auto-update

The Mac updater accepts a new build only when its signature requirement matches the running app. An ad hoc signature changes on every build, so Mac auto-update fails. The release signs the Mac app with one fixed free self-signed certificate instead.

## What the release does

- The `mac` job in `team-release.yml` imports the certificate from two repository secrets: `MAC_SELF_SIGN_P12` (base64 of the .p12) and `MAC_SELF_SIGN_PASSWORD`.
- `scripts/self-sign-macos.cjs` re-signs the app after electron-builder with that identity.
- The job fails if the app is not signed with the certificate. Without the secrets the job warns and the app stays ad hoc signed.

## Limits

- This is not an Apple Developer ID. Gatekeeper still blocks the first open. Users click **Open Anyway** once.
- A Mac that runs an older ad hoc build must install one new .dmg by hand. After that, updates apply on their own.
- Changing the certificate breaks auto-update once for every user. Keep the .p12 safe and do not rotate it without a reason. The certificate expires in 2036.

## Make a new certificate

Run this outside the repo. Never commit the key or the .p12.

```bash
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 3650 \
  -subj "/CN=Leonidas Self-Signed" -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" -addext "basicConstraints=critical,CA:false"
PW=$(openssl rand -hex 16)
openssl pkcs12 -export -inkey key.pem -in cert.pem -out sign.p12 -name "Leonidas Self-Signed" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -passout "pass:$PW"
base64 -w0 sign.p12 | gh secret set MAC_SELF_SIGN_P12 -R ItzJsimp/leonidas-code
printf %s "$PW" | gh secret set MAC_SELF_SIGN_PASSWORD -R ItzJsimp/leonidas-code
```

The old SHA-1 key encryption is on purpose: the macOS `security import` command rejects the newer default.
