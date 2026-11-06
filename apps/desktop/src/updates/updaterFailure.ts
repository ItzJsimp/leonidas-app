// A Mac app whose signature the updater rejects can never update itself. This file turns
// that case into a plain instruction. The cause text can hold a URL with a token, so it never
// reaches the log or the screen: only the fixed instruction and a fixed log label do.
const MAC_SIGNATURE_FAILURE = /code ?signature|not signed|signature .*(?:valid|verif)/i;

export function isMacSignatureFailure(platform: string, cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return platform === "darwin" && MAC_SIGNATURE_FAILURE.test(message.slice(0, 500));
}

export function describeUpdaterFailure(input: {
  readonly platform: string;
  readonly cause: unknown;
  readonly fallback: string;
  readonly feed: Readonly<Record<string, string>> | null;
}): string {
  if (!isMacSignatureFailure(input.platform, input.cause)) return input.fallback;
  const { owner, repo } = input.feed ?? {};
  const link =
    owner && repo
      ? `: https://github.com/${owner}/${repo}/releases/latest/download/Leonidas-Setup-mac.dmg`
      : ".";
  return `This Mac update cannot install over your copy of Leonidas Code. Download the newest installer once and replace the app in Applications${link}`;
}
