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
 * Per-doctor, per-day collected-fees breakdown over an inclusive date range.
 * Used by finance for charting / drill-down. The range is capped server-side
 * to a sane upper bound to keep the payload bounded.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DoctorCollectionsDailyResponse {

    private LocalDate fromDate;
    private LocalDate toDate;
    private List<DoctorDailyRow> doctors;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DoctorDailyRow {
        private UUID doctorId;
        private String doctorName;
        private String specialization;
        private BigDecimal total;
        /** One entry per day in [fromDate, toDate]. Days with no collections appear as 0. */
        private List<DailyAmount> daily;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailyAmount {
        private LocalDate date;
        private BigDecimal amount;
    }
}
