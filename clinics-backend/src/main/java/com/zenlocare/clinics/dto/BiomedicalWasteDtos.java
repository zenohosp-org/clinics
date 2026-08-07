package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Holder for the bio-medical-waste wire shapes. Grouped so the controller's
 * import list stays small, following the BloodBankDtos convention.
 */
public final class BiomedicalWasteDtos {

    private BiomedicalWasteDtos() {}

    // ─────── Lookups ───────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LookupDto {
        private UUID id;
        private String lookupType;
        private String code;
        private String label;
        private String metadata;
        private Integer displayOrder;
        private Boolean isSystem;
        private Boolean isActive;
    }

    // ─────── Logs ──────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LogDto {
        private UUID id;
        private LocalDate logDate;
        private String categoryCode;
        private String categoryLabel;
        private String generationPointCode;
        private String generationPointLabel;
        private BigDecimal weightKg;
        private Integer bagCount;
        private String collectedByUserName;
        private String notes;
        private UUID handoverId;
        /** "PENDING" or "HANDED_OVER". */
        private String status;
        private LocalDateTime createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LogRequest {
        private LocalDate logDate;
        private String categoryCode;
        private String generationPointCode;
        private BigDecimal weightKg;
        private Integer bagCount;
        private String notes;
    }

    // ─────── Stats ─────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatsDto {
        private BigDecimal todayKg;
        private BigDecimal weekKg;
        private BigDecimal monthKg;
        private BigDecimal pendingKg;
        /** Category code → pending kg not yet handed over. */
        private Map<String, BigDecimal> pendingByCategory;
    }

    // ─────── Handovers ─────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HandoverDto {
        private UUID id;
        private LocalDate handoverDate;
        private String vendorName;
        private String manifestNumber;
        private String vehicleNumber;
        private String receivedByName;
        private BigDecimal totalWeightKg;
        /** Category code → total kg in this handover. */
        private Map<String, BigDecimal> categoryBreakdown;
        private BigDecimal costAmount;
        private String invoiceNumber;
        private String notes;
        private int logCount;
        private String createdByUserName;
        private LocalDateTime createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HandoverRequest {
        private LocalDate handoverDate;
        private String vendorName;
        private String manifestNumber;
        private String vehicleNumber;
        private String receivedByName;
        private BigDecimal costAmount;
        private String invoiceNumber;
        private String notes;
        private List<UUID> logIds;
    }
}
