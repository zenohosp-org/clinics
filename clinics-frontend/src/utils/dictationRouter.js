import { drugsApi } from "@/utils/api";

/**
 * Splits one dictated transcript across the consultation's separate fields
 * by spoken section cues ("chief complaint... notes... prescribe...") instead
 * of dumping the whole clip into one textarea.
 *
 * Heuristic, not NLP: a doctor who never says a heading gets the old
 * behaviour (everything into notes) for free, since unmatched text is the
 * default segment. A doctor who does say headings gets it routed. Either
 * way, everything lands in an editable field — this is a convenience over
 * typing, not a substitute for the doctor reading what got filled in.
 */
const HEADINGS = [
  { field: "chiefComplaint", re: /\b(chief complaint|complaint)s?\b[:,]?\s*/i },
  { field: "instructions", re: /\b(instructions?|advice)\b[:,]?\s*/i },
  { field: "prescription", re: /\b(prescri(be|ption)|medicine|tablet|tab)s?\b[:,]?\s*/i },
  { field: "notes", re: /\b(notes?|assessment|examination|findings|plan)\b[:,]?\s*/i },
];

function splitByHeadings(transcript) {
  // Find every heading's first match position, keep only ones that actually
  // occur, sort by where they appear in the speech.
  const hits = HEADINGS
    .map(h => ({ ...h, match: transcript.match(h.re) }))
    .filter(h => h.match)
    .map(h => ({ field: h.field, index: h.match.index, len: h.match[0].length }))
    .sort((a, b) => a.index - b.index);

  if (hits.length === 0) {
    return [{ field: "notes", text: transcript.trim() }];
  }

  const segments = [];
  // Anything spoken before the first heading has nowhere else to go.
  if (hits[0].index > 0) {
    const lead = transcript.slice(0, hits[0].index).trim();
    if (lead) segments.push({ field: "notes", text: lead });
  }
  hits.forEach((h, i) => {
    const start = h.index + h.len;
    const end = i + 1 < hits.length ? hits[i + 1].index : transcript.length;
    const text = transcript.slice(start, end).trim();
    if (text) segments.push({ field: h.field, text });
  });
  return segments;
}

/**
 * Try a phrase, then progressively shorter word-prefixes of it, against the
 * drug catalog — stops at the first hit. Bounded to a handful of calls
 * (never more words than the segment has) so one dictation can't fan out
 * into an unbounded number of searches.
 */
async function findDrugMatch(hospitalId, phrase) {
  const words = phrase.split(/\s+/).filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    const candidate = words.slice(0, n).join(" ");
    if (candidate.length < 3) continue; // too short to search usefully
    try {
      const results = await drugsApi.search(hospitalId, candidate);
      if (Array.isArray(results) && results.length > 0) return results[0];
    } catch {
      // Search failing shouldn't block the rest of the dictation from
      // landing in its fields — just skip the match for this segment.
    }
  }
  return null;
}

/**
 * @param {string} transcript - raw MedASR output
 * @param {object} handlers
 * @param {string} handlers.hospitalId
 * @param {(text: string) => void} handlers.appendChiefComplaint
 * @param {(text: string) => void} handlers.appendNotes
 * @param {(text: string) => void} handlers.appendInstructions
 * @param {(drug: object) => void} handlers.addDrug
 * @returns {Promise<{ matchedDrug: object|null, unmatchedPrescriptionText: string|null }>}
 *   Lets the caller notify "heard X but nothing in the catalog matched"
 *   rather than silently dropping a prescription mention.
 */
export async function routeDictation(transcript, handlers) {
  const { hospitalId, appendChiefComplaint, appendNotes, appendInstructions, addDrug } = handlers;
  const segments = splitByHeadings(transcript);

  let matchedDrug = null;
  let unmatchedPrescriptionText = null;

  for (const seg of segments) {
    if (seg.field === "chiefComplaint") appendChiefComplaint(seg.text);
    else if (seg.field === "instructions") appendInstructions(seg.text);
    else if (seg.field === "notes") appendNotes(seg.text);
    else if (seg.field === "prescription") {
      const drug = await findDrugMatch(hospitalId, seg.text);
      if (drug) {
        addDrug(drug);
        matchedDrug = drug;
      } else {
        // No catalog match — don't lose what was said; fold it into notes
        // so the doctor still sees it and can add the drug by hand.
        appendNotes(`Prescription (unmatched): ${seg.text}`);
        unmatchedPrescriptionText = seg.text;
      }
    }
  }

  return { matchedDrug, unmatchedPrescriptionText };
}
