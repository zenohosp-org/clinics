package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.IpdVitals;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.AdmissionRepository;
import com.zenlocare.clinics.repository.IpdVitalsRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * IPD vitals endpoints — one reading per nursing observation round, scoped
 * to an IPD admission. Unlike appointment_vitals (one upsert row per OPD
 * visit), this accumulates many rows per admission.
 *
 * Tenant isolation is application-layer only: hospital_id and patient_id are
 * derived from the admission entity server-side; the controller validates that
 * the admission belongs to the requesting user's hospital before any write.
 *
 * Range violations are rejected with HTTP 400 naming the offending field.
 * Values are never silently clamped — a typo must be corrected, not hidden.
 */
@RestController
@RequestMapping("/api/ipd/vitals")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'hospital_admin', 'super_admin')")
public class IpdVitalsController {

    private final IpdVitalsRepository ipdVitalsRepo;
    private final AdmissionRepository admissionRepo;
    private final UserRepository userRepo;

    /**
     * All readings for one admission, newest first.
     * readOnly transaction is required so the LAZY recordedBy → User proxy
     * can be walked inside toDto() without a LazyInitializationException.
     */
    @GetMapping("/admission/{admissionId}")
    @Transactional(readOnly = true)
    public ResponseEntity<List<IpdVitalsDto>> list(@PathVariable UUID admissionId) {
        return ResponseEntity.ok(
            ipdVitalsRepo.findByAdmissionIdOrderByRecordedAtDesc(admissionId)
                         .stream()
                         .map(this::toDto)
                         .toList()
        );
    }

    /**
     * Record a new vitals reading.
     *
     * Validation order:
     *  1. admissionId must exist.
     *  2. Admission's hospital must match the principal's hospital (cross-tenant guard).
     *  3. At least one vital measurement must be non-null (recorded_at alone is not
     *     a valid reading — it would silently create a blank row with no clinical value).
     *  4. Each supplied value must be within its plausible clinical range. Out-of-range
     *     values are rejected with HTTP 400 naming the field — never clamped, because
     *     a clamped typo becomes a fake reading in the clinical record.
     *
     * hospital_id and patient_id are always derived from the admission; they are never
     * accepted from the request body.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<IpdVitalsDto> create(
            @RequestBody IpdVitalsRequest req,
            @AuthenticationPrincipal User principal) {

        if (req.getAdmissionId() == null) {
            throw new BadRequestException("admissionId is required");
        }
        if (req.getRecordedAt() == null) {
            throw new BadRequestException("recordedAt is required");
        }

        var admission = admissionRepo.findById(req.getAdmissionId())
                .orElseThrow(() -> new ResourceNotFoundException("Admission not found"));

        // Re-fetch principal to get a managed entity with hospital loaded.
        User recorder = userRepo.findById(principal.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        // Cross-tenant guard — prevent a user from writing vitals to another
        // hospital's admission by sending a valid but foreign admissionId.
        UUID admissionHospitalId = admission.getHospital() != null ? admission.getHospital().getId() : null;
        UUID recorderHospitalId  = recorder.getHospital()  != null ? recorder.getHospital().getId()  : null;
        if (recorderHospitalId == null || !recorderHospitalId.equals(admissionHospitalId)) {
            throw new UnauthorizedException("Admission does not belong to your hospital");
        }

        // At least one vital measurement is required.
        if (allVitalsNull(req)) {
            throw new BadRequestException(
                "At least one vital measurement must be provided — " +
                "recorded_at alone is not a valid reading");
        }

        // Range validation — reject, never coerce.
        validateRanges(req);

        IpdVitals reading = IpdVitals.builder()
                .hospitalId(admission.getHospital().getId())
                .admissionId(req.getAdmissionId())
                .patientId(admission.getPatient().getId())
                .recordedAt(req.getRecordedAt())
                .recordedBy(recorder)
                .bpSystolic(req.getBpSystolic())
                .bpDiastolic(req.getBpDiastolic())
                .heartRate(req.getHeartRate())
                .respiratoryRate(req.getRespiratoryRate())
                .temperature(req.getTemperature())
                .spo2(req.getSpo2())
                .painScore(req.getPainScore())
                .bloodGlucose(req.getBloodGlucose())
                .weightKg(req.getWeightKg())
                .notes(req.getNotes())
                .build();

        IpdVitals saved = java.util.Objects.requireNonNull(ipdVitalsRepo.save(reading));
        return ResponseEntity.ok(toDto(saved));
    }

    // ── Validation helpers ────────────────────────────────────────────────────

    private boolean allVitalsNull(IpdVitalsRequest req) {
        return req.getBpSystolic()     == null
            && req.getBpDiastolic()    == null
            && req.getHeartRate()      == null
            && req.getRespiratoryRate() == null
            && req.getTemperature()    == null
            && req.getSpo2()           == null
            && req.getPainScore()      == null
            && req.getBloodGlucose()   == null
            && req.getWeightKg()       == null;
    }

    /**
     * Throws BadRequestException naming the first out-of-range field.
     * Ranges are plausible clinical limits — not device limits — so obviously
     * impossible values (spo2 = 150, pain = 11) are caught here.
     */
    private void validateRanges(IpdVitalsRequest req) {
        if (req.getBpSystolic() != null && (req.getBpSystolic() < 40 || req.getBpSystolic() > 300))
            throw new BadRequestException(
                "bp_systolic must be between 40 and 300 mmHg (got " + req.getBpSystolic() + ")");

        if (req.getBpDiastolic() != null && (req.getBpDiastolic() < 20 || req.getBpDiastolic() > 200))
            throw new BadRequestException(
                "bp_diastolic must be between 20 and 200 mmHg (got " + req.getBpDiastolic() + ")");

        if (req.getHeartRate() != null && (req.getHeartRate() < 20 || req.getHeartRate() > 300))
            throw new BadRequestException(
                "heart_rate must be between 20 and 300 bpm (got " + req.getHeartRate() + ")");

        if (req.getRespiratoryRate() != null && (req.getRespiratoryRate() < 5 || req.getRespiratoryRate() > 60))
            throw new BadRequestException(
                "respiratory_rate must be between 5 and 60 breaths/min (got " + req.getRespiratoryRate() + ")");

        if (req.getTemperature() != null) {
            double t = req.getTemperature().doubleValue();
            if (t < 90.0 || t > 110.0)
                throw new BadRequestException(
                    "temperature must be between 90.0 and 110.0 °F (got " + req.getTemperature() + ")");
        }

        if (req.getSpo2() != null && (req.getSpo2() < 0 || req.getSpo2() > 100))
            throw new BadRequestException(
                "spo2 must be between 0 and 100% (got " + req.getSpo2() + ")");

        if (req.getPainScore() != null && (req.getPainScore() < 0 || req.getPainScore() > 10))
            throw new BadRequestException(
                "pain_score must be between 0 and 10 (got " + req.getPainScore() + ")");

        if (req.getBloodGlucose() != null && (req.getBloodGlucose() < 20 || req.getBloodGlucose() > 1000))
            throw new BadRequestException(
                "blood_glucose must be between 20 and 1000 mg/dL (got " + req.getBloodGlucose() + ")");
    }

    // ── DTO mapping ───────────────────────────────────────────────────────────

    private IpdVitalsDto toDto(IpdVitals v) {
        IpdVitalsDto dto = new IpdVitalsDto();
        dto.setId(v.getId().toString());
        dto.setAdmissionId(v.getAdmissionId().toString());
        dto.setRecordedAt(v.getRecordedAt() != null ? v.getRecordedAt().toString() : null);
        dto.setCreatedAt(v.getCreatedAt() != null ? v.getCreatedAt().toString() : null);
        dto.setBpSystolic(v.getBpSystolic());
        dto.setBpDiastolic(v.getBpDiastolic());
        dto.setHeartRate(v.getHeartRate());
        dto.setRespiratoryRate(v.getRespiratoryRate());
        dto.setTemperature(v.getTemperature());
        dto.setSpo2(v.getSpo2());
        dto.setPainScore(v.getPainScore());
        dto.setBloodGlucose(v.getBloodGlucose());
        dto.setWeightKg(v.getWeightKg());
        dto.setNotes(v.getNotes());
        if (v.getRecordedBy() != null) {
            dto.setRecordedById(v.getRecordedBy().getId().toString());
            dto.setRecordedByName(
                v.getRecordedBy().getFirstName() +
                (v.getRecordedBy().getLastName() != null
                    ? " " + v.getRecordedBy().getLastName()
                    : ""));
        }
        return dto;
    }

    // ── Inner request / response types ────────────────────────────────────────

    @Data
    public static class IpdVitalsRequest {
        private UUID admissionId;
        private LocalDateTime recordedAt;
        private Integer bpSystolic;
        private Integer bpDiastolic;
        private Integer heartRate;
        private Integer respiratoryRate;
        private BigDecimal temperature;
        private Integer spo2;
        private Integer painScore;
        private Integer bloodGlucose;
        private BigDecimal weightKg;
        private String notes;
    }

    @Data
    public static class IpdVitalsDto {
        private String id;
        private String admissionId;
        private String recordedAt;
        private String createdAt;
        private String recordedById;
        private String recordedByName;
        private Integer bpSystolic;
        private Integer bpDiastolic;
        private Integer heartRate;
        private Integer respiratoryRate;
        private BigDecimal temperature;
        private Integer spo2;
        private Integer painScore;
        private Integer bloodGlucose;
        private BigDecimal weightKg;
        private String notes;
    }
}
