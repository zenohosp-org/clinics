package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.User;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Thin read-only window into the hospital's pharmacy catalog. Reads from
 * {@code inventory_items} filtered by {@code billing_group = 'PHARMACY'} —
 * the inventory app owns this table and is the canonical source for what a
 * hospital actually carries / sells. Pharmacy backend reads the same rows
 * and stores {@code inventory_item_id} on its own records; HMS reading
 * inventory_items directly keeps both apps consistent with one master.
 *
 * Earlier this endpoint queried {@code pharmacy_drug_master} which is a
 * narrower / older table; many hospitals had only test data there, so the
 * picker would return one drug. Inventory's drug catalog is the live source.
 *
 * Gated to clinicians + hospital admins so general staff can't enumerate the
 * drug catalogue through this endpoint.
 */
@RestController
@RequestMapping("/api/drugs")
@RequiredArgsConstructor
public class DrugController {

    private final JdbcTemplate jdbc;

    /**
     * Search active drugs in a hospital's master. Matches on brand_name,
     * generic_name, or salt_name (case-insensitive prefix-or-contains).
     * Capped at 50 results — picker is a typeahead, not a catalogue browser.
     *
     * `inStock` reflects whether the drug is linked to an inventory item id —
     * pharmacy uses this to know what it actually carries. UI displays a
     * subtle hint; doctors can still prescribe out-of-stock drugs because
     * pharmacy resolves substitution / sourcing at dispense time.
     */
    @GetMapping("/search")
    @PreAuthorize("hasAnyRole('doctor', 'hospital_admin', 'super_admin')")
    public ResponseEntity<List<DrugDto>> search(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false, defaultValue = "") String q,
            @AuthenticationPrincipal User user) {

        // Tenant guard — the hospitalId on the URL must match the caller's hospital
        // (super_admin bypasses). Without this, a forged hospitalId would expose
        // another hospital's drug catalogue via this endpoint.
        if (user != null && user.getRole() != null
                && !"super_admin".equalsIgnoreCase(user.getRole().getName())
                && user.getHospital() != null
                && !user.getHospital().getId().equals(hospitalId)) {
            throw new AccessDeniedException("Drug search restricted to caller's hospital");
        }

        String like = "%" + (q == null ? "" : q.trim().toLowerCase()) + "%";
        // inventory_items doesn't carry brand_name / strength / form as separate
        // columns the way pharmacy_drug_master did — the display string is in
        // `name`, and clinical metadata is split across name/generic_name. The
        // DTO keeps the brandName/genericName/strength/form shape so the picker
        // UI doesn't need to change; strength/form just come back null and the
        // existing `[generic, strength, form].filter(Boolean).join(" · ")` line
        // in the modal handles that cleanly.
        String sql = """
            SELECT id, name, generic_name, drug_schedule, code, hsn_code
              FROM inventory_items
             WHERE hospital_id = ?
               AND billing_group = 'PHARMACY'
               AND COALESCE(is_active, TRUE) = TRUE
               AND (
                   LOWER(name)                          LIKE ?
                OR LOWER(COALESCE(generic_name, ''))    LIKE ?
                OR LOWER(COALESCE(code, ''))            LIKE ?
               )
             ORDER BY name ASC
             LIMIT 50
            """;

        List<DrugDto> rows = jdbc.query(sql,
                ps -> {
                    ps.setObject(1, hospitalId);
                    ps.setString(2, like);
                    ps.setString(3, like);
                    ps.setString(4, like);
                },
                (rs, i) -> {
                    DrugDto d = new DrugDto();
                    Object idObj = rs.getObject("id");
                    d.setId(idObj != null ? idObj.toString() : null);
                    d.setBrandName(rs.getString("name"));
                    d.setGenericName(rs.getString("generic_name"));
                    d.setSaltName(rs.getString("generic_name")); // inventory_items has no separate salt column
                    d.setStrength(null);
                    d.setForm(null);
                    d.setSchedule(rs.getString("drug_schedule"));
                    // Reaching this query at all means the item is billable under
                    // PHARMACY for this hospital → it's in the catalog. Live
                    // batch-level stock is a separate concern (pharmacy_stock_batches);
                    // the picker just confirms presence in the master.
                    d.setInStock(true);
                    return d;
                });

        appendCatalogFallback(rows, q);
        return ResponseEntity.ok(rows);
    }

    /**
     * Appends suggestions from the all-India medicines reference catalog
     * ({@code pharmacy_medicine_catalog}, ~223k brands, hospital-agnostic)
     * for names the hospital's master doesn't carry. Rows come back with
     * {@code id = null} and {@code inStock = false}; the picker shows them
     * badged "not stocked". Picking one saves a normalized brand name, so
     * pharmacy's substitute matching works instead of receiving free text.
     *
     * Best-effort: the catalog is reference data loaded by script — if the
     * table (or pg_trgm) is missing, e.g. on a fresh dev database, the
     * search silently stays master-only.
     */
    private void appendCatalogFallback(List<DrugDto> rows, String q) {
        String query = q == null ? "" : q.trim().toLowerCase();
        if (query.length() < 2) {
            return;
        }
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (DrugDto d : rows) {
            if (d.getBrandName() != null) {
                seen.add(d.getBrandName().trim().toLowerCase());
            }
        }
        try {
            List<DrugDto> catalog = jdbc.query("""
                SELECT name, therapeutic_class, habit_forming
                  FROM pharmacy_medicine_catalog
                 WHERE name ILIKE ('%' || ? || '%') OR name % ?
                 ORDER BY (name ILIKE (? || '%')) DESC, similarity(name, ?) DESC, name
                 LIMIT 10
                """,
                    ps -> {
                        ps.setString(1, query);
                        ps.setString(2, query);
                        ps.setString(3, query);
                        ps.setString(4, query);
                    },
                    (rs, i) -> {
                        DrugDto d = new DrugDto();
                        d.setId(null);                          // not a master item
                        d.setBrandName(rs.getString("name"));   // normalized catalog name
                        d.setGenericName(rs.getString("therapeutic_class"));
                        d.setInStock(false);
                        d.setHabitForming(rs.getBoolean("habit_forming"));
                        return d;
                    });
            for (DrugDto c : catalog) {
                if (c.getBrandName() != null && seen.add(c.getBrandName().trim().toLowerCase())) {
                    rows.add(c);
                }
            }
        } catch (Exception e) {
            // Catalog absent / pg_trgm missing — master-only results are fine.
        }
    }

    @Data
    public static class DrugDto {
        private String id;
        private String brandName;
        private String genericName;
        private String saltName;
        private String strength;
        private String form;
        /** H, H1, X, etc. — controlled-substance schedule per the Drugs Act. */
        private String schedule;
        /** True if pharmacy actually carries this in inventory today. */
        private boolean inStock;
        /** From the reference catalog: true if the medicine is habit-forming. Null for master rows. */
        private Boolean habitForming;
    }
}
