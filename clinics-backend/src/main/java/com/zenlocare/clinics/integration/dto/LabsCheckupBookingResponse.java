package com.zenlocare.clinics.integration.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.UUID;

/**
 * Inbound shape from labs' POST /api/health-checkups/bookings. Only the
 * id is consumed today — AppointmentService re-fetches the entity via
 * the still-existing HealthCheckupBookingRepository to satisfy the
 * @ManyToOne relationship on Appointment. Once Phase D lands and the
 * relationship becomes a plain UUID column, this DTO is enough on its
 * own and the re-fetch goes away.
 *
 * Unknown fields are tolerated so labs can extend the response without
 * breaking HMS deserialization.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class LabsCheckupBookingResponse {
    private UUID id;
}
