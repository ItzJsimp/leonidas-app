// electron-builder afterSign hook. The Mac updater accepts a new build only when its
// signature requirement matches the running app. An ad hoc signature changes on every
// build, so each update fails. This hook re-signs the app with one fixed identity.
// It does nothing unless the release workflow sets LEONIDAS_MAC_SELF_SIGN_IDENTITY.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function selfSignMacos(context) {
  const identity = process.env.LEONIDAS_MAC_SELF_SIGN_IDENTITY;
  if (!identity || context.electronPlatformName !== "darwin") return;

  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const keychain = process.env.LEONIDAS_MAC_SELF_SIGN_KEYCHAIN;
  // shortcut: no hardened runtime and no notarization, so Gatekeeper still asks once. Upgrade with an Apple Developer ID.
  const args = ["--force", "--deep", "--timestamp=none", "--sign", identity];
  if (keychain) args.push("--keychain", keychain);
  args.push(app);

  execFileSync("codesign", args, { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
};
