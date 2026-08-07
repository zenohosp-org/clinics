const validateEmail = (email) => {
  if (!email) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email address";
};
const validatePassword = (password) => {
  if (!password) return "Password is required";
  if (password.length < 6) return "Password must be at least 6 characters";
};
const validateRequired = (value, label = "This field") => {
  if (!value || !value.trim()) return `${label} is required`;
};
const validatePhone = (phone) => {
  if (!phone) return void 0;
  if (!/^\+?[\d\s\-()]{7,15}$/.test(phone)) return "Invalid phone number";
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return "Phone number must have 10 digits";
};
// Strips anything that isn't a phone-appropriate character as the user types,
// so free-text (letters, *&^% etc.) can't get into a phone field at all —
// validatePhone above is the submit-time backstop for what gets through.
const sanitizePhone = (raw) => raw.replace(/[^\d+\s\-()]/g, '').slice(0, 15);
// Letters (any script, so accented/transliterated names aren't broken) plus
// spaces, apostrophes, periods and hyphens (O'Brien, Anne-Marie, Jr.) — no
// digits. Also capitalizes the letter right after the start of the string or
// a space/hyphen/apostrophe as you type (ravi -> Ravi, o'brien -> O'Brien,
// anne-marie -> Anne-Marie), leaving the rest of each word untouched so it
// never fights someone deliberately typing mixed case like "McDonald".
const sanitizeName = (raw) =>
  raw
    .replace(/[^\p{L}\s'.-]/gu, '')
    .replace(/(^|[\s'-])(\p{L})/gu, (_, boundary, letter) => boundary + letter.toUpperCase());
const TZ = 'Asia/Kolkata'
const formatDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
};
const formatDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
const calcAge = (dob) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = /* @__PURE__ */ new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};
const generateInvoiceNumber = () => {
  const now = /* @__PURE__ */ new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9e3) + 1e3;
  return `INV-${dateStr}-${rand}`;
};
export {
  calcAge,
  formatDate,
  formatDateTime,
  generateInvoiceNumber,
  sanitizeName,
  sanitizePhone,
  validateEmail,
  validatePassword,
  validatePhone,
  validateRequired
};
