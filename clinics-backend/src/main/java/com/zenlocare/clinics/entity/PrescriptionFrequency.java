package com.zenlocare.clinics.entity;

/**
 * Standard schedule shorthand for prescriptions. Persisted as an integer FK
 * into {@code prescription_frequencies} via {@link
 * com.zenlocare.clinics.converter.PrescriptionFrequencyConverter}, same
 * pattern as AppointmentStatus / AdmissionStatus.
 *
 * Ids are stable contract — adding new values is OK, renumbering is not.
 */
public enum PrescriptionFrequency {
    OD(1),      // Once daily
    BD(2),      // Twice daily
    TDS(3),     // Thrice daily
    QID(4),     // Four times daily
    Q4H(5),     // Every 4 hours
    Q6H(6),     // Every 6 hours
    Q8H(7),     // Every 8 hours
    HS(8),      // At bedtime
    AC(9),      // Before meals
    PC(10),     // After meals
    SOS(11),    // As needed
    STAT(12);   // Immediately, once

    public final int id;

    PrescriptionFrequency(int id) { this.id = id; }

    public static PrescriptionFrequency fromId(int id) {
        for (PrescriptionFrequency f : values()) {
            if (f.id == id) return f;
        }
        throw new IllegalArgumentException("Unknown PrescriptionFrequency id: " + id);
    }

    /** Lenient parse from the API — null/blank → null, unknown → throws so caller sees a clear 400. */
    public static PrescriptionFrequency fromCode(String code) {
        if (code == null || code.isBlank()) return null;
        try {
            return PrescriptionFrequency.valueOf(code.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Unknown frequency: " + code
                    + ". Allowed: OD, BD, TDS, QID, Q4H, Q6H, Q8H, HS, AC, PC, SOS, STAT");
        }
    }
}
