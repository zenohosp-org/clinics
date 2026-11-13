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

    /** The clear message when anything in the cause chain is the invoices trigger's GST refusal, else null. */
    public static String gstNotConfigured(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String m = t.getMessage();
            if (m != null && m.contains("GST_NOT_CONFIGURED")) return NOT_CONFIGURED;
        }
        return null;
    }
}
