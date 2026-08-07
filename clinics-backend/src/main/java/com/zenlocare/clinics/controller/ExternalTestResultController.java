package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.ExternalTestResult;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.service.ExternalTestResultService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * External lab / radiology / pathology results — typed in by the
 * doctor or staff during a consultation, with an optional scanned
 * report linked via attachment_id.
 *
 * The endpoints lean on JSR-303 to enforce the request shape (sizes,
 * non-null fields). The service layer enforces tenancy + category
 * whitelist. Per-method role gates match the rest of the codebase.
 */
@RestController
@RequestMapping("/api/external-results")
@RequiredArgsConstructor
public class ExternalTestResultController {

    private final ExternalTestResultService service;

    @PostMapping
    @PreAuthorize("hasAnyRole('doctor', 'staff', 'hospital_admin', 'super_admin')")
    public ResponseEntity<ExternalTestResultDto> create(
            @Valid @RequestBody CreateExternalTestResultRequest req,
            @AuthenticationPrincipal User principal) {

        ExternalTestResult row = service.create(
                req.getHospitalId(), req.getPatientId(), req.getRecordId(), req.getAppointmentId(),
                req.getCategory(), req.getTestName(), req.getTestCode(),
                req.getResultValue(), req.getResultUnit(), req.getReferenceRange(),
                req.getIsAbnormal(), req.getTestDate(),
                req.getSourceName(), req.getSourceDoctorName(),
                req.getAttachmentId(), req.getNotes(),
                principal);
        return ResponseEntity.ok(toDto(row));
    }

    /**
     * Visit-scoped listing. The consultation Lab Tests tab and the
     * three-page print sheet both use this — they want only the
     * reports captured during this specific visit, not the patient's
     * full lab history. Cross-visit views (Patient Details rollup)
     * use listForPatient instead.
     */
    @GetMapping("/appointment/{appointmentId}")
    public ResponseEntity<java.util.List<ExternalTestResultDto>> listForAppointment(
            @PathVariable UUID appointmentId,
            @RequestParam UUID hospitalId,
            @AuthenticationPrincipal User principal) {
        java.util.List<ExternalTestResultDto> rows = service
                .listForAppointment(appointmentId, hospitalId, principal)
                .stream().map(this::toDto).toList();
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/patient/{patientId}")
    public ResponseEntity<Page<ExternalTestResultDto>> listForPatient(
            @PathVariable Integer patientId,
            @RequestParam UUID hospitalId,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 25) Pageable pageable,
            @AuthenticationPrincipal User principal) {

        Page<ExternalTestResult> page = service.listForPatient(
                hospitalId, patientId, category, from, to, pageable, principal);
        return ResponseEntity.ok(page.map(this::toDto));
    }

    private ExternalTestResultDto toDto(ExternalTestResult r) {
        ExternalTestResultDto d = new ExternalTestResultDto();
        d.setId(r.getId().toString());
        d.setHospitalId(r.getHospitalId().toString());
        d.setPatientId(r.getPatientId());
        d.setRecordId(r.getRecordId() != null ? r.getRecordId().toString() : null);
        d.setAppointmentId(r.getAppointmentId() != null ? r.getAppointmentId().toString() : null);
        d.setCategory(r.getCategory());
        d.setTestName(r.getTestName());
        d.setTestCode(r.getTestCode());
        d.setResultValue(r.getResultValue());
        d.setResultUnit(r.getResultUnit());
        d.setReferenceRange(r.getReferenceRange());
        d.setIsAbnormal(r.getIsAbnormal());
        d.setTestDate(r.getTestDate() != null ? r.getTestDate().toString() : null);
        d.setSourceName(r.getSourceName());
        d.setSourceDoctorName(r.getSourceDoctorName());
        d.setAttachmentId(r.getAttachmentId() != null ? r.getAttachmentId().toString() : null);
        d.setNotes(r.getNotes());
        d.setCreatedBy(r.getCreatedBy().toString());
        d.setCreatedAt(r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
        return d;
    }

    @Data
    public static class CreateExternalTestResultRequest {
        @NotNull private UUID hospitalId;
        @NotNull private Integer patientId;
        private UUID recordId;
        /** Visit context. Set whenever the entry is made from an
         *  appointment-scoped flow (triage modal, consultation view). */
        private UUID appointmentId;

        @NotBlank @Size(max = 24)  private String category;
        @NotBlank @Size(max = 255) private String testName;
        @Size(max = 40)            private String testCode;
        @Size(max = 255)           private String resultValue;
        @Size(max = 40)            private String resultUnit;
        @Size(max = 80)            private String referenceRange;
        private Boolean isAbnormal;
        @NotNull private LocalDate testDate;
        @NotBlank @Size(max = 255) private String sourceName;
        @Size(max = 255)           private String sourceDoctorName;
        private UUID attachmentId;
        @Size(max = 4000)          private String notes;
    }

    @Data
    public static class ExternalTestResultDto {
        private String id;
        private String hospitalId;
        private Integer patientId;
        private String recordId;
        private String appointmentId;
        private String category;
        private String testName;
        private String testCode;
        private String resultValue;
        private String resultUnit;
        private String referenceRange;
        private Boolean isAbnormal;
        private String testDate;
        private String sourceName;
        private String sourceDoctorName;
        private String attachmentId;
        private String notes;
        private String createdBy;
        private String createdAt;
    }
}
