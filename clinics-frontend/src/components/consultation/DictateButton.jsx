import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { useDictation } from "@/hooks/useDictation";

/**
 * Mic button that turns a recorded clip into text.
 *
 * Two modes, chosen by which props are passed:
 *  - value + onChange: write the raw transcript into one field directly
 *    (append by default, or replace with `replace`).
 *  - onTranscript: hand the raw transcript to the caller instead — used by
 *    the consultation form to route one dictation across several fields
 *    (chief complaint / notes / instructions / prescription) by spoken
 *    heading, rather than dumping everything into a single box.
 *
 * Deliberately appends rather than replaces in the default simple mode:
 * dictation speeds up writing notes, it isn't meant to be trusted as the
 * sole source of them — a doctor typing partial notes, then dictating an
 * addition, then editing the result is the expected flow. `replace` is for
 * single-value fields (e.g. a drug-name search box) where appending would
 * just glue two names together.
 *
 * `iconOnly` renders a compact round mic with no visible label — meant for
 * placing directly on a field/card so dictation goes straight into that
 * one field instead of through the whole-consultation router, which has to
 * guess which field a heading-less word belongs to. One mic per field beats
 * one mic for everything on accuracy: no heading to say, no routing to get
 * wrong, just talk and the words land exactly where the cursor already is.
 */
export default function DictateButton({ value, onChange, onTranscript, replace = false, label = "Dictate", iconOnly = false }) {
  const handleResult = (text) => {
    if (!text) return;
    if (onTranscript) {
      onTranscript(text);
      return;
    }
    if (replace) {
      onChange(text);
      return;
    }
    const sep = value && !value.endsWith(" ") && !value.endsWith("\n") ? " " : "";
    onChange((value ?? "") + sep + text);
  };

  const { status, error, start, stop } = useDictation(handleResult);

  const isRecording = status === "recording";
  const isBusy = status === "transcribing";
  const title = isRecording ? "Stop and transcribe" : isBusy ? "Transcribing…" : label;

  return (
    <div className={`clinic-dictate${iconOnly ? " is-icon-only" : ""}`}>
      <button
        type="button"
        onClick={isRecording ? stop : start}
        disabled={isBusy}
        className={`clinic-dictate__btn${isRecording ? " is-recording" : ""}${iconOnly ? " is-icon-only" : ""}`}
        title={title}
        aria-label={title}
      >
        {isBusy ? (
          <Loader2 className="w-3.5 h-3.5 clinic-dictate__spin" />
        ) : isRecording ? (
          <Square className="w-3 h-3" />
        ) : (
          <Mic className="w-3.5 h-3.5" />
        )}
        {!iconOnly && <span>{isRecording ? "Stop" : isBusy ? "Transcribing…" : label}</span>}
      </button>
      {error && !iconOnly && (
        <span className="clinic-dictate__error">
          <AlertCircle className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}
