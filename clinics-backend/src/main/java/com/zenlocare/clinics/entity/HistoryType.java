package com.zenlocare.clinics.entity;

/**
 * Reference enum for the type of a patient medical record.
 * Persisted as an integer FK to the `record_history_types` reference table
 * via {@link com.zenlocare.clinics.converter.HistoryTypeConverter}.
 *
 * Keep the IDs stable — they're stored in DB rows.
 */
public enum HistoryType {
    CONSULTATION(1),
    PRESCRIPTION(2),
    LAB_RESULT(3),
    SURGERY(4),
    DIAGNOSIS(5),
    OTHERS(6),
    PROGRESS_NOTE(7);

    public final int id;

    HistoryType(int id) { this.id = id; }

    public static HistoryType fromId(int id) {
        for (HistoryType t : values()) {
            if (t.id == id) return t;
        }
        throw new IllegalArgumentException("Unknown HistoryType id: " + id);
    }

    /**
     * Lenient parser for incoming String values (e.g. from REST payloads).
     * Falls back to OTHERS for null / blank / unrecognized inputs so a typo
     * or missing field doesn't blow up record creation.
     */
    public static HistoryType fromName(String name) {
        if (name == null || name.isBlank()) return OTHERS;
        try {
            return HistoryType.valueOf(name.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return OTHERS;
        }
    }
}
