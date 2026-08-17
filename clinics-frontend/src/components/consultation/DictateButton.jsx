import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { useDictation } from "@/hooks/useDictation";

/**
 * Mic button that appends a transcribed clip into a text field.
 *
 * Deliberately appends rather than replaces: dictation is meant to speed up
 * writing notes, not to be trusted as the sole source of them — a doctor
 * typing partial notes, then dictating an addition, then editing the result
 * is the expected flow, not "dictate once and never touch it again".
 *
 * @param {string} value - current field value
 * @param {(next: string) => void} onChange - field setter
 */
export default function DictateButton({ value, onChange }) {
  const handleResult = (text) => {
    if (!text) return;
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
        <span>{isRecording ? "Stop" : isBusy ? "Transcribing…" : "Dictate"}</span>
      </button>
      {error && (
        <span className="clinic-dictate__error">
          <AlertCircle className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}
