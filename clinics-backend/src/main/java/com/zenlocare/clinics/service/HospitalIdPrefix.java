package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.Hospital;

/**
 * Builds the per-hospital ID prefix used in every human-readable record number
 * (admission, IPD, invoice, MRN, room code, UHID, etc.).
 *
 * Format: "{4-digit-code}-" — e.g., "1001-".
 *
 * Returns "" if the hospital is null or has no numericCode assigned yet, so
 * generators stay backward-compatible during the rollout window.
 */
public final class HospitalIdPrefix {

    private HospitalIdPrefix() {}

    public static String of(Hospital hospital) {
        if (hospital == null) return "";
        String code = hospital.getNumericCode();
        return (code != null && !code.isBlank()) ? code + "-" : "";
    }

    public static String of(String numericCode) {
        return (numericCode != null && !numericCode.isBlank()) ? numericCode + "-" : "";
    }

    /**
     * Strips any leading "{NNNN}-" hospital prefix from an ID so legacy and prefixed
     * IDs share a unified sequence-extraction path.
     *
     * Examples:
     *   "1001-IPD-2026-0042" → "IPD-2026-0042"
     *   "IPD-2026-0042"      → "IPD-2026-0042"
     *   null                 → null
     */
    public static String stripHospitalPrefix(String id) {
        if (id == null || id.length() < 5) return id;
        // Look for leading 4 digits followed by "-"
        if (Character.isDigit(id.charAt(0))
                && Character.isDigit(id.charAt(1))
                && Character.isDigit(id.charAt(2))
                && Character.isDigit(id.charAt(3))
                && id.charAt(4) == '-') {
            return id.substring(5);
        }
        return id;
    }
}
