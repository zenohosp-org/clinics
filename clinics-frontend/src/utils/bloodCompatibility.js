// ABO/Rh compatibility helpers — mirrors BloodBankService.java so the
// "Issue Blood" modal can warn before submitting (the backend remains the
// source of truth and re-checks on issue).

const RBC_COMPONENTS = new Set(["WHOLE_BLOOD", "PRBC"]);

// Recipient group code -> set of bag group codes safe to transfuse (RBC components).
const RBC_COMPATIBLE_DONORS = {
  O_NEG: new Set(["O_NEG"]),
  O_POS: new Set(["O_NEG", "O_POS"]),
  A_NEG: new Set(["O_NEG", "A_NEG"]),
  A_POS: new Set(["O_NEG", "O_POS", "A_NEG", "A_POS"]),
  B_NEG: new Set(["O_NEG", "B_NEG"]),
  B_POS: new Set(["O_NEG", "O_POS", "B_NEG", "B_POS"]),
  AB_NEG: new Set(["O_NEG", "A_NEG", "B_NEG", "AB_NEG"]),
  AB_POS: new Set(["O_NEG", "O_POS", "A_NEG", "A_POS", "B_NEG", "B_POS", "AB_NEG", "AB_POS"]),
};

// Recipient ABO letter -> set of donor ABO letters safe for plasma-bearing components (Rh irrelevant).
const PLASMA_COMPATIBLE_DONOR_ABO = {
  O: new Set(["O", "A", "B", "AB"]),
  A: new Set(["A", "AB"]),
  B: new Set(["B", "AB"]),
  AB: new Set(["AB"]),
};

/** Converts a Patient.bloodGroup value ("A+", "O-", ...) to a lookup code ("A_POS", "O_NEG", ...), or null if unrecognized. */
export function normalizeBloodGroupCode(patientBloodGroup) {
  if (!patientBloodGroup) return null;
  switch (patientBloodGroup.trim().toUpperCase()) {
    case "A+": return "A_POS";
    case "A-": return "A_NEG";
    case "B+": return "B_POS";
    case "B-": return "B_NEG";
    case "AB+": return "AB_POS";
    case "AB-": return "AB_NEG";
    case "O+": return "O_POS";
    case "O-": return "O_NEG";
    default: return null;
  }
}

/** Renders a lookup code ("A_POS") back to its short label ("A+") for messages. */
export function bloodGroupLabel(code) {
  if (!code) return "Unknown";
  return code.replace("_POS", "+").replace("_NEG", "-");
}

/**
 * True if a bag of bagGroupCode/componentCode is safe to transfuse into a
 * recipient with patientGroupCode. RBC-bearing components follow standard
 * donor-antigen rules; plasma-bearing components follow the reversed,
 * ABO-only (Rh-irrelevant) rule.
 */
export function isCompatible(bagGroupCode, componentCode, patientGroupCode) {
  if (!bagGroupCode || !patientGroupCode) return true;
  if (RBC_COMPONENTS.has(componentCode)) {
    const donors = RBC_COMPATIBLE_DONORS[patientGroupCode];
    return !donors || donors.has(bagGroupCode);
  }
  const patientAbo = patientGroupCode.split("_")[0];
  const bagAbo = bagGroupCode.split("_")[0];
  const donors = PLASMA_COMPATIBLE_DONOR_ABO[patientAbo];
  return !donors || donors.has(bagAbo);
}
