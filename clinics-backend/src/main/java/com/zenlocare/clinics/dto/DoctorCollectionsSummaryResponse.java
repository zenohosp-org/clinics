package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Per-doctor collected-fees summary for finance reporting.
 *
 * Buckets are aligned to Asia/Kolkata so a day boundary means "IST midnight",
 * not the server's container timezone. All bucket boundaries are returned so
 * the finance side can render them without re-deriving the math.
 *
 * "Collected" means a row exists in {@code invoice_payments} — i.e. cash/UPI/etc.
 * was actually received. Outstanding-but-billed amounts are NOT counted.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DoctorCollectionsSummaryResponse {

    /** Reference "today" used to derive the three windows. */
    private LocalDate asOfDate;

    /** Window starts (inclusive). All windows end at {@code asOfDate} (inclusive). */
    private LocalDate todayStart;   // = asOfDate
    private LocalDate weekStart;    // asOfDate − 6 days
    private LocalDate monthStart;   // first day of asOfDate's month

    private List<DoctorCollectionRow> doctors;
    private Totals totals;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DoctorCollectionRow {
        /** Null when the payment's invoice has neither an appointment nor an admission. */
        private UUID doctorId;
        private String doctorName;
        private String specialization;
        private BigDecimal today;
        private BigDecimal last7Days;
        private BigDecimal thisMonth;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Totals {
        private BigDecimal today;
        private BigDecimal last7Days;
        private BigDecimal thisMonth;
    }
}
