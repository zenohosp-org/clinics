import { useCallback, useRef, useState } from "react";
import { transcribeAudio } from "@/utils/dictationApi";

/**
 * Record a clip from the mic, then transcribe it on stop.
 *
 * Record-then-transcribe rather than live streaming: MedASR isn't a
 * frame-synchronous streaming model (its own docs recommend processing
 * complete chunked windows), so "live" word-by-word text is not what this
 * buys you — a clean complete clip transcribed in one shot is both simpler
 * and more accurate than approximating streaming over it.
 *
 * @param {(text: string) => void} onResult - called with the transcript once
 *   ready. The caller decides what to do with it (e.g. append to a textarea)
 *   — this hook never writes to any field itself.
 */
export function useDictation(onResult) {
  const [status, setStatus] = useState("idle"); // idle | recording | transcribing | error
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];

        if (blob.size === 0) {
          setStatus("idle");
          return;
        }

        setStatus("transcribing");
        try {
          const text = await transcribeAudio(blob);
          onResult(text);
          setStatus("idle");
        } catch (err) {
          setError(err?.message ?? "Could not transcribe audio");
          setStatus("error");
        }
      };

      recorder.start();
      setStatus("recording");
    } catch (err) {
      // Most commonly: mic permission denied, or no mic device present.
      setError(err?.message ?? "Could not access the microphone");
      setStatus("error");
    }
  }, [onResult, stopStream]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { status, error, start, stop };
}
