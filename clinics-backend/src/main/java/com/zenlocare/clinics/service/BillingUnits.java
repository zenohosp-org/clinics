package com.zenlocare.clinics.service;

import com.zenlocare.clinics.exception.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Who issues a bill. Directory decides: every hospital has a "hospital services" billing unit, and a service
 * line (laboratory, radiology, health checkups, blood bank) may have a unit of its own with its own GSTIN.
 * The database function {@code gst_issuing_unit} (Directory V5) is the single source of that answer; the
 * invoices trigger (V12) stamps it on every invoice and refuses a line that belongs to another unit.
 *
 * <p>Code that adds a service line's charge to an existing bill asks here first, so it can put the charge
 * on the line's own bill when the two differ instead of being refused by the database.
 */
@Component
@RequiredArgsConstructor
public class BillingUnits {

    public static final String LAB = "LAB";
    public static final String RADIOLOGY = "RADIOLOGY";
    public static final String HEALTH_CHECKUP = "HEALTH_CHECKUP";
    public static final String BLOOD_BANK = "BLOOD_BANK";

    private static final String UNIT_TYPE_SERVICE_LINE = "SERVICE_LINE";

    /** The unit a bill would be issued by today. */
    public record IssuingUnit(UUID unitId, String unitType, String serviceLine, String name, String gstin,
                              boolean inForce) {
        /** True when this is a service line's own unit rather than hospital services. */
        public boolean separate() {
            return UNIT_TYPE_SERVICE_LINE.equals(unitType);
        }
    }

    /** What a unit is, for display. A unit's type and service line never change, so this is cached for good. */
    public record UnitLabel(String name, boolean separate) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final Map<UUID, UnitLabel> labels = new ConcurrentHashMap<>();

    /** The unit that issues bills for {@code serviceLine} (null = a hospital service), or null if none is set up. */
    public IssuingUnit issuingUnit(UUID hospitalId, String serviceLine) {
        List<IssuingUnit> rows = jdbcTemplate.query(
                "SELECT unit_id, unit_type, service_line, unit_name, gstin, in_force FROM gst_issuing_unit(?, ?)",
                (rs, i) -> new IssuingUnit(rs.getObject("unit_id", UUID.class), rs.getString("unit_type"),
                        rs.getString("service_line"), rs.getString("unit_name"), rs.getString("gstin"),
                        rs.getBoolean("in_force")),
                hospitalId, serviceLine);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * Refuses up front, with the reason, when a bill for this service line could not be issued. The invoices
     * trigger enforces the same rule; checking first stops the action cleanly instead of failing the
     * transaction half-way. There is no fallback to another unit's GSTIN.
     */
    public IssuingUnit requireIssuingUnit(UUID hospitalId, String serviceLine) {
        IssuingUnit unit = issuingUnit(hospitalId, serviceLine);
        if (unit == null) {
            throw new BadRequestException(GstBillingGuard.NOT_CONFIGURED);
        }
        if (!unit.inForce()) {
            throw new BadRequestException("Billing is blocked: " + unit.name() + " bills under GSTIN " + unit.gstin()
                    + ", which is not in force today. A super admin must assign a GSTIN in force in "
                    + "Directory > Hospital > GST Registrations.");
        }
        return unit;
    }

    /** True when a charge of {@code serviceLine} may go on a bill issued by {@code billingUnitId}. */
    public boolean billsOn(UUID hospitalId, String serviceLine, UUID billingUnitId) {
        if (billingUnitId == null) {
            return true;    // a bill from before units were recorded: hospital services
        }
        IssuingUnit unit = issuingUnit(hospitalId, serviceLine);
        return unit != null && billingUnitId.equals(unit.unitId());
    }

    /** Service lines that issue their own bills in this hospital (codes from gst_service_lines). */
    public List<String> separateServiceLines(UUID hospitalId) {
        return jdbcTemplate.queryForList(
                "SELECT service_line FROM gst_billing_units WHERE hospital_id = ? AND unit_type = 'SERVICE_LINE' "
                        + "AND is_active ORDER BY service_line", String.class, hospitalId);
    }

    public UnitLabel label(UUID billingUnitId) {
        if (billingUnitId == null) {
            return null;
        }
        return labels.computeIfAbsent(billingUnitId, id -> jdbcTemplate.query(
                "SELECT u.unit_type, coalesce(l.name, 'Hospital services') AS name FROM gst_billing_units u "
                        + "LEFT JOIN gst_service_lines l ON l.code = u.service_line WHERE u.id = ?",
                (rs, i) -> new UnitLabel(rs.getString("name"), UNIT_TYPE_SERVICE_LINE.equals(rs.getString("unit_type"))),
                id).stream().findFirst().orElse(new UnitLabel("Hospital services", false)));
    }
}
