package com.zenlocare.clinics.integration.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Outbound shape for POST /api/health-checkups/bookings on the labs
 * service. Mirrors HMS's (soon-to-be-removed) inner type
 * HealthCheckupService.BookingRequest field-for-field so labs accepts
 * the same JSON HMS used to produce in-process.
 */
@Data
@NoArgsConstructor
public class LabsCheckupBookingRequest {
    private Integer patientId;
    private UUID packageId;
    private UUID doctorId;
    private String scheduledDate;
    private String scheduledTime;
    private String paymentStatus;
    private BigDecimal amountPaid;
    private String notes;
}
