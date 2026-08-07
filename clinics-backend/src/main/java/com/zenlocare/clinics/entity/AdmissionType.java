package com.zenlocare.clinics.entity;

public enum AdmissionType {
    OPD_REFERRAL(1),
    EMERGENCY(2),
    DIRECT(3);

    public final int id;

    AdmissionType(int id) { this.id = id; }

    public static AdmissionType fromId(int id) {
        for (AdmissionType s : values()) {
            if (s.id == id) return s;
        }
        throw new IllegalArgumentException("Unknown AdmissionType id: " + id);
    }
}
