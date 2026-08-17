import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { useDictation } from "@/hooks/useDictation";

/**
 * Mic button that turns a recorded clip into text.
 *
 * Two modes, chosen by which props are passed:
 *  - value + onChange: append the raw transcript into one field (simple case).
 *  - onTranscript: hand the raw transcript to the caller instead — used by
 *    the consultation form to route one dictation across several fields
 *    (chief complaint / notes / instructions / prescription) by spoken
 *    heading, rather than dumping everything into a single box.
 *
 * Deliberately appends rather than replaces in the simple mode: dictation
 * speeds up writing notes, it isn't meant to be trusted as the sole source
 * of them — a doctor typing partial notes, then dictating an addition, then
 * editing the result is the expected flow.
 */
export default function DictateButton({ value, onChange, onTranscript, label = "Dictate" }) {
  const handleResult = (text) => {
    if (!text) return;
    if (onTranscript) {
      onTranscript(text);
      return;
    }
    const sep = value && !value.endsWith(" ") && !value.endsWith("\n") ? " " : "";
    onChange((value ?? "") + sep + text);
  };

  const { status, error, start, stop } = useDictation(handleResult);

  const isRecording = status === "recording";
  const isBusy = status === "transcribing";

  return (
    <div className="clinic-dictate">
      <button
        type="button"
        onClick={isRecording ? stop : start}
        disabled={isBusy}
        className={`clinic-dictate__btn${isRecording ? " is-recording" : ""}`}
        title={
          isRecording ? "Stop and transcribe" : isBusy ? "Transcribing…" : "Dictate"
        }
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 clinic-dictate__spin" />
        ) : isRecording ? (
          <Square className="w-3 h-3" />
        ) : (
          <Mic className="w-3.5 h-3.5" />
        )}
        <span>{isRecording ? "Stop" : isBusy ? "Transcribing…" : label}</span>
      </button>
      {error && (
        <span className="clinic-dictate__error">
          <AlertCircle className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}
