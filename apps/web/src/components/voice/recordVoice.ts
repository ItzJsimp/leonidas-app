import { VOICE_MAX_AUDIO_BYTES } from "@t3tools/contracts";

/** A 0 to 1 loudness read for the level bars. It reads 0 where the browser has no Web Audio. */
function meterFor(stream: MediaStream) {
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    return {
      level: () => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
        return peak / 128;
      },
      close: () => void context.close().catch(() => {}),
    };
  } catch {
    return { level: () => 0, close: () => {} };
  }
}

/** Speech-grade bitrate: a full 10 minute take stays far under the upload limit. */
const VOICE_BITS_PER_SECOND = 32_000;

/** Keeps a phone from locking itself in the middle of a take. Best effort: some browsers refuse. */
function holdScreenAwake() {
  let lock: WakeLockSentinel | undefined;
  let released = false;
  const drop = (held: WakeLockSentinel) => void held.release().catch(() => {});
  void globalThis.navigator?.wakeLock
    ?.request("screen")
    .then((held) => (released ? drop(held) : void (lock = held)))
    .catch(() => {});
  return () => {
    released = true;
    if (lock) drop(lock);
  };
}

/** A phone suspends the mic of a hidden page, so the take ends there and keeps what it heard. */
function stopWhenPhoneHidesPage(stop: () => void) {
  if (!globalThis.window?.matchMedia?.("(pointer: coarse)").matches) return () => {};
  const onChange = () => {
    if (document.visibilityState === "hidden") stop();
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** One bounded recording. Both completion and cancellation release the microphone. */
export function recordVoice(stream: MediaStream) {
  const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: VOICE_BITS_PER_SECOND,
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const meter = meterFor(stream);
  let chunks: Blob[] = [];
  let bytes = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  const stop = () => {
    if (recorder.state === "recording") recorder.stop();
  };
  let releaseScreen = () => {};
  let unwatchPage = () => {};
  const result = new Promise<Blob | null>((resolve, reject) => {
    const release = () => {
      clearTimeout(timer);
      releaseScreen();
      unwatchPage();
      meter.close();
      stream.getTracks().forEach((track) => track.stop());
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    };
    recorder.ondataavailable = ({ data }) => {
      bytes += data.size;
      if (bytes > VOICE_MAX_AUDIO_BYTES) {
        cancelled = true;
        reject(new Error("Recording reached the size limit. Try a shorter take."));
        stop();
      } else if (!cancelled) chunks.push(data);
    };
    recorder.onerror = () => {
      cancelled = true;
      release();
      chunks = [];
      reject(new Error("The microphone stopped. Check its connection and try again."));
    };
    recorder.onstop = () => {
      release();
      const blob = cancelled ? null : new Blob(chunks, { type: recorder.mimeType });
      chunks = [];
      resolve(blob);
    };
    try {
      recorder.start(1000);
    } catch (error) {
      release();
      reject(error);
      return;
    }
    releaseScreen = holdScreenAwake();
    unwatchPage = stopWhenPhoneHidesPage(stop);
    timer = setTimeout(stop, 600_000);
  });
  return {
    result,
    level: meter.level,
    stop,
    cancel: () => {
      cancelled = true;
      stop();
    },
  };
}

export function voiceAudioBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The recording could not be read. Try again."));
    reader.readAsDataURL(blob);
  });
}
