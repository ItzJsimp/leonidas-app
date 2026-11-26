import { useCallback, useEffect, useRef, useState } from "react";

import { clipRange, wavBlob, type MeetingSegment } from "./meetings.logic";
import type { Call } from "./useMeetingsCall";

/** One shared audio element: a click on a transcript line plays that line, a second click stops it. */
export function useClipPlayer(call: Call, meetingId: string) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const ticket = useRef(0);

  const stop = useCallback(() => {
    ticket.current += 1;
    audio.current?.pause();
    audio.current = null;
    if (url.current !== null) URL.revokeObjectURL(url.current);
    url.current = null;
    setPlaying(null);
    setLoading(null);
  }, []);
  useEffect(() => stop, [stop, meetingId]);

  /** Resolves to a plain sentence when the clip cannot play, or null. */
  const play = useCallback(
    async (key: string, segment: MeetingSegment): Promise<string | null> => {
      const wasPlaying = playing === key;
      stop();
      if (wasPlaying) return null;
      const mine = ticket.current;
      setLoading(key);
      const { from, to } = clipRange(segment);
      const result = await call("POST", `${encodeURIComponent(meetingId)}/clip`, {
        from,
        to,
        track: segment.track ?? "them",
      });
      if (mine !== ticket.current) return null;
      setLoading(null);
      const wav = result.ok ? (result.value as { wav?: unknown } | null)?.wav : undefined;
      if (typeof wav !== "string") {
        return result.ok ? "The clip is not valid." : result.message;
      }
      const next = new Audio((url.current = URL.createObjectURL(wavBlob(wav))));
      audio.current = next;
      next.onended = () => {
        if (audio.current === next) stop();
      };
      setPlaying(key);
      try {
        await next.play();
      } catch {
        stop();
        return "The browser blocked the sound. Click the line again.";
      }
      return null;
    },
    [call, meetingId, playing, stop],
  );

  return { playing, loading, play };
}
