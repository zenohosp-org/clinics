package com.zenlocare.clinics.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reference-data")
@RequiredArgsConstructor
public class ReferenceDataController {

    private final JdbcTemplate jdbcTemplate;

    private static final String[] TABLES = {
        "appointment_statuses",
        "appointment_types",
        "invoice_statuses",
        "room_statuses",
        "bed_statuses",
        "radiology_statuses",
        "radiology_priorities",
        "ambulance_booking_statuses",
        "ambulance_vehicle_statuses",
        "checkup_booking_statuses",
        "admission_statuses",
        "admission_types",
        "admission_sources",
        // Prescription clinical taxonomies — driven by HMS, read by both HMS UI
        // (dropdowns in the prescription picker) and pharmacy backend (to
        // resolve human-readable labels when displaying a dispense queue).
        "prescription_frequencies",
        "prescription_routes"
    };

    @GetMapping
    public Map<String, List<Map<String, Object>>> getReferenceData() {
        Map<String, List<Map<String, Object>>> result = new LinkedHashMap<>();
        for (String table : TABLES) {
            try {
                result.put(table, jdbcTemplate.queryForList("SELECT id, code FROM " + table + " ORDER BY id"));
            } catch (Exception e) {
                result.put(table, List.of());
            }
        }
        return result;
    }
}
