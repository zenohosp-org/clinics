package com.zenlocare.clinics.service;

import com.zenlocare.clinics.exception.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Up-front check that the clinic can issue invoices: its "Hospital services" billing unit must be mapped in
 * Directory to a GST registration in force. The shared invoices table enforces the same rule at insert (HMS
 * V11 trigger, error GST_NOT_CONFIGURED) with no fallback GSTIN. Flows that open an invoice as a side effect
 * (admission, appointment confirmation) check first, so they fail early with a clear message instead of
 * aborting the transaction half-way.
 */
@Component
@RequiredArgsConstructor
public class GstBillingGuard {

    public static final String NOT_CONFIGURED = "Billing is blocked: hospital services has no GST registration "
            + "in force. A super admin must assign a GSTIN to Hospital services in Directory > Hospital > GST "
            + "Registrations before bills can be issued.";

    private final JdbcTemplate jdbcTemplate;

    public void requireHospitalServicesGstin(UUID hospitalId) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM v_gst_billing_unit_registrations WHERE hospital_id = ? AND unit_type = 'HOSPITAL_SERVICES'",
                Integer.class, hospitalId);
        if (n == null || n == 0) {
            throw new BadRequestException(NOT_CONFIGURED);
        }
    }

    /**
     * The message to show when anything in the cause chain is a GST refusal from the invoices triggers
     * (no GSTIN in force, or a charge put on another unit's bill — HMS V11/V12), else null.
     */
    public static String gstNotConfigured(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String blocked = databaseMessage(t.getMessage(), "GST_NOT_CONFIGURED: ");
            if (blocked != null) return "Billing is blocked: " + blocked;
            String mismatch = databaseMessage(t.getMessage(), "GST_UNIT_MISMATCH: ");
            if (mismatch != null) return mismatch;
        }
        return null;
    }

    private static String databaseMessage(String message, String marker) {
        int i = message == null ? -1 : message.indexOf(marker);
        if (i < 0) return null;
        String text = message.substring(i + marker.length());
        int end = text.indexOf('\n');
        return end >= 0 ? text.substring(0, end) : text;
    }
}
