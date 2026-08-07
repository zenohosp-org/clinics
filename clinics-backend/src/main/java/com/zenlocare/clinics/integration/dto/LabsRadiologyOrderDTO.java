package com.zenlocare.clinics.integration.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Inbound shape from labs' GET /api/radiology responses. Mirrors HMS's
 * (soon-to-be-removed) dto.RadiologyOrderDTO field-for-field so the JSON
 * contract is identical to what HMS produced before the migration.
 *
 * Lives under integration/dto/ rather than dto/ so the class survives
 * Phase D's deletion of dto/RadiologyOrderDTO.java.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class LabsRadiologyOrderDTO {
    private Long id;
    private UUID hospitalId;
    private Integer patientId;
    private String patientName;
    private String patientUhid;
    private UUID admissionId;
    private String admissionNumber;
    private String serviceName;
    private String specializationName;
    private String referredByName;
    private UUID technicianId;
    private String technicianName;
    private String priority;
    private String status;
    private LocalDate scheduledDate;
    private String billNo;
    private BigDecimal price;
    private LocalDateTime scannedAt;
    private LocalDateTime reportedAt;
    private String findings;
    private String observation;
    private String reportId;
    private String createdByName;
    private LocalDateTime createdAt;
}
