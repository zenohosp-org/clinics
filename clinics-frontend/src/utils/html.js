// Escapes a value for safe interpolation into an HTML string.
//
// Used by the print-invoice builders (OPD/IPD billing, invoice list) which
// assemble raw HTML for a same-origin iframe — patient names, item
// descriptions, etc. come from user-entered data and must not be allowed
// to inject markup into that document.
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
