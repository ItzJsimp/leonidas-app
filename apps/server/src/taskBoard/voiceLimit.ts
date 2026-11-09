const VOICE_CONFIG = "http://127.0.0.1:8765/config";
const DEFAULT_SECONDS = 600;

function validSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86400;
}

export async function readVoiceLimit(request: typeof fetch = fetch): Promise<number> {
  const response = await request(VOICE_CONFIG, {
    signal: AbortSignal.timeout(2000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Could not read the voice throttle.");
  const config: unknown = await response.json();
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("The voice settings are invalid.");
  }
  const value = Reflect.get(config, "speak_rate_limit_seconds") ?? DEFAULT_SECONDS;
  if (!validSeconds(value)) throw new Error("The voice throttle is invalid.");
  return value;
}

export async function setVoiceLimit(value: number, request: typeof fetch = fetch): Promise<void> {
  if (!validSeconds(value)) throw new Error("Enter a number from 0 to 86400 seconds.");
  const response = await request(VOICE_CONFIG, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ speak_rate_limit_seconds: value }),
    signal: AbortSignal.timeout(2000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Could not save the voice throttle.");
}
