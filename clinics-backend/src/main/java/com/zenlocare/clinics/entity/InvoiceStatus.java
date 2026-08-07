package com.zenlocare.clinics.entity;

public enum InvoiceStatus {
    UNPAID(1),
    PARTIAL(2),
    PAID(3),
    CANCELLED(4),
    SETTLED(5),
    UNSETTLED(6);

    public final int id;

    InvoiceStatus(int id) { this.id = id; }

    public static InvoiceStatus fromId(int id) {
        for (InvoiceStatus s : values()) {
            if (s.id == id) return s;
        }
        throw new IllegalArgumentException("Unknown InvoiceStatus id: " + id);
    }
}
