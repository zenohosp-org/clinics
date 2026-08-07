package com.zenlocare.clinics.entity;

public enum CheckupBookingStatus {
    SCHEDULED(1),
    CHECKED_IN(2),
    IN_PROGRESS(3),
    COMPLETED(4),
    CANCELLED(5),
    NO_SHOW(6);

    public final int id;

    CheckupBookingStatus(int id) { this.id = id; }

    public static CheckupBookingStatus fromId(int id) {
        for (CheckupBookingStatus s : values()) {
            if (s.id == id) return s;
        }
        throw new IllegalArgumentException("Unknown CheckupBookingStatus id: " + id);
    }
}
