package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Structured lab / radiology / pathology result captured from an
 * outside lab or clinic the patient brought a report from. Sidecar
 * to the patient + (optionally) a specific patient_records row; never
 * replaces the consultation record itself.
 *
 * Append-only. Wrong entry? Insert a new row with a corrective note;
 * the original survives, matching the same posture as RecordAttachment
 * and RoomLog. Hospitals don't delete clinical evidence.
 *
 * When the hospital builds its own lab / radiology / pathology module
 * later (the OT and pharmacy pattern), internally-raised results stay
 * in their own service's tables. This table keeps representing the
 * outside-the-hospital evidence forever, because patients will always
 * bring reports from elsewhere.
 */
@Entity
@Table(name = "external_test_results")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExternalTestResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    /** Nullable — supports standalone entry from Patient Details without a current consultation. */
    @Column(name = "record_id")
    private UUID recordId;

    /**
     * Visit the result was captured against. Triage staff add reports
     * during CHECKED_IN / IN_PROGRESS, well before a consultation
     * record exists, so we link to the appointment directly rather
     * than waiting for record_id to be available. Patient Details and
     * other cross-visit views still query by patient_id and ignore
     * this column.
     */
    @Column(name = "appointment_id")
    private UUID appointmentId;

    /** LAB | RADIOLOGY | PATHOLOGY | OTHER */
    @Column(nullable = false, length = 24)
    private String category;

    @Column(name = "test_name", nullable = false, length = 255)
    private String testName;

    /** Optional standardised code (LOINC / SNOMED / hospital-local). Future-friendly slot. */
    @Column(name = "test_code", length = 40)
    private String testCode;

    /** Quantitative or qualitative — "12.4" or "Normal" or "No fracture seen". */
    @Column(name = "result_value", length = 255)
    private String resultValue;

    @Column(name = "result_unit", length = 40)
    private String resultUnit;

    @Column(name = "reference_range", length = 80)
    private String referenceRange;

    @Column(name = "is_abnormal")
    private Boolean isAbnormal;

    @Column(name = "test_date", nullable = false)
    private LocalDate testDate;

    @Column(name = "source_name", nullable = false, length = 255)
    private String sourceName;

    @Column(name = "source_doctor_name", length = 255)
    private String sourceDoctorName;

    /** Optional link to a scanned PDF / photo of the report, stored as a RecordAttachment. */
    @Column(name = "attachment_id")
    private UUID attachmentId;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Builder.Default
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
