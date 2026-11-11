import { afterEach, expect, it, vi } from "vite-plus/test";
import { recordVoice } from "./recordVoice";

class Recorder {
  static isTypeSupported() {
    return true;
  }
  static current: Recorder;
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    Recorder.current = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["complete take"]) });
    this.onstop?.();
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("releases tracks and timers across ten recordings", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", Recorder);
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  for (let index = 0; index < 10; index++) {
    const session = recordVoice(stream);
    session.stop();
    expect(await (await session.result)?.text()).toBe("complete take");
    expect(vi.getTimerCount()).toBe(0);
    expect(Recorder.current.ondataavailable).toBeNull();
  }
  expect(stop).toHaveBeenCalledTimes(10);
});
it("discards cancelled audio and releases the microphone", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", Recorder);
  const stop = vi.fn();
  const session = recordVoice({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  session.cancel();
  expect(await session.result).toBeNull();
  expect(stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("reads a level of 0 when the browser has no Web Audio", () => {
  vi.stubGlobal("MediaRecorder", Recorder);
  const session = recordVoice({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream);
  expect(session.level()).toBe(0);
  session.cancel();
});
it("reads the loudest sample and closes the audio context on release", async () => {
  vi.stubGlobal("MediaRecorder", Recorder);
  const close = vi.fn(() => Promise.resolve());
  vi.stubGlobal(
    "AudioContext",
    class {
      createAnalyser() {
        return {
          fftSize: 0,
          getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128).set([192, 100]),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      close = close;
    },
  );
  const session = recordVoice({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream);
  expect(session.level()).toBe(0.5);
  session.stop();
  await session.result;
  expect(close).toHaveBeenCalledTimes(1);
});
