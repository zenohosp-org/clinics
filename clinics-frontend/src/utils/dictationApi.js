import { Client, handle_file } from "@gradio/client";

// Points at the MedASR demo Space (huggingface.co/spaces/adi0697/clinics-medasr-demo).
// Temporary: this calls a public demo Space directly from the browser rather
// than a service we own, so consultation audio leaves our infra to transcribe.
// Fine for a demo; the real integration replaces this with a self-hosted
// service (see the Mac Mini plan) before any real patient audio goes near it.
const SPACE_ID = "adi0697/clinics-medasr-demo";

let clientPromise = null;
function getClient() {
  // Connecting is the slow part (Space cold-start if it's been idle); do it
  // once and reuse the connection for every subsequent dictation in the
  // session instead of reconnecting per recording.
  //
  // token: an unauthenticated ZeroGPU call only gets the 2min/day anonymous
  // quota; an authenticated one gets the calling account's own 5min/day
  // quota — a completely separate pool. VITE_HF_TOKEN is a Vite build-time
  // value, which means it ships inside the public JS bundle like any other
  // VITE_* var — there is no way to keep it server-side in a static build.
  // Use a low-privilege, easily-revocable token here, and rotate/remove it
  // once this stopgap is replaced by the self-hosted service.
  const token = import.meta.env.VITE_HF_TOKEN;
  if (!clientPromise) clientPromise = Client.connect(SPACE_ID, token ? { token } : undefined);
  return clientPromise;
}

/**
 * Send a recorded audio clip to MedASR and return the transcript.
 * @param {Blob} audioBlob
 * @returns {Promise<string>}
 */
export async function transcribeAudio(audioBlob) {
  const client = await getClient();
  // Gradio 6 names the API endpoint after the Python function (app.py's
  // `def transcribe(...)`), not a generic /predict — confirmed against the
  // Space's own error message listing its actual named endpoints.
  const result = await client.predict("/transcribe", [handle_file(audioBlob)]);
  const text = result?.data?.[0];
  return typeof text === "string" ? text.trim() : "";
}
