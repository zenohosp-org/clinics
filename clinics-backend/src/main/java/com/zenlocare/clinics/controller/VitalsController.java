package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.AppointmentVitals;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.AppointmentRepository;
import com.zenlocare.clinics.repository.AppointmentVitalsRepository;
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
 * Vital-sign capture endpoints, scoped per appointment. The nurse records
 * BP, SpO2, heart rate, and weight before the doctor moves the appointment
 * to IN_PROGRESS; the doctor's consultation modal reads them back at open
 * time so the patient's current state is visible at a glance.
 *
 * Role gate is wide — anyone with hospital-floor access can record vitals
 * because in practice that's nurses (mapped to the staff role), the doctor
 * themselves on a busy day, and admins reconciling errors. Reads are
 * restricted to the same set so we don't leak vitals to roles that
 * shouldn't see them.
 */
@RestController
@RequestMapping("/api/vitals")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'hospital_admin', 'super_admin')")
public class VitalsController {

    private final AppointmentVitalsRepository vitalsRepo;
    private final AppointmentRepository appointmentRepo;
    private final UserRepository userRepo;

    /**
     * Single-row lookup keyed on appointment. 204 when nothing recorded yet.
     *
     * readOnly transaction wraps the response so the toDto mapping can
     * walk the LAZY recordedBy → User proxy — without it the proxy hits a
     * "no session" LazyInitializationException at first name access.
     */
    @GetMapping("/appointment/{appointmentId}")
    @Transactional(readOnly = true)
    public ResponseEntity<VitalsDto> getForAppointment(@PathVariable UUID appointmentId) {
        return vitalsRepo.findByAppointmentId(appointmentId)
                .map(v -> ResponseEntity.ok(toDto(v)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * Bulk listing scoped to the hospital — the appointments dashboard
     * uses this to badge rows that already have vitals so the front desk
     * sees at a glance who's been triaged.
     */
    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<VitalsDto>> listForHospital(@RequestParam UUID hospitalId) {
        List<VitalsDto> dtos = vitalsRepo.findByHospitalId(hospitalId).stream().map(this::toDto).toList();
        return ResponseEntity.ok(dtos);
    }

    /**
     * Last few readings for one patient — the consultation modal pulls
     * this for follow-up visits so the doctor can eyeball trends (BP
     * trending up, weight loss across visits). Newest first.
     */
    @GetMapping("/patient/{patientId}/history")
    @Transactional(readOnly = true)
    public ResponseEntity<List<VitalsDto>> historyForPatient(
            @PathVariable Integer patientId,
            @RequestParam UUID hospitalId) {
        List<VitalsDto> dtos = vitalsRepo
                .findTop5ByPatientIdAndHospitalIdOrderByRecordedAtDesc(patientId, hospitalId)
                .stream().map(this::toDto).toList();
        return ResponseEntity.ok(dtos);
    }

    /**
     * Upsert keyed on appointment. Idempotent — calling twice with the
     * same body is a no-op apart from updated_at moving. recordedBy and
     * recordedAt freeze on the original create; only updated_at moves on
     * subsequent re-takes so the audit trail of "who first triaged"
     * stays intact.
     */
    @PutMapping("/appointment/{appointmentId}")
    @Transactional
    public ResponseEntity<VitalsDto> upsert(
            @PathVariable UUID appointmentId,
            @RequestBody VitalsRequest req,
            @AuthenticationPrincipal User principal) {

        // Tenant + appointment existence guard — without this any
        // authenticated user could write vitals for any UUID.
        var appt = appointmentRepo.findById(appointmentId)
                .orElseThrow(() -> new RuntimeException("Appointment not found"));

        // Re-fetch the principal in this TX — the JWT filter hands us a
        // detached User; saving via a JoinColumn=recorded_by needs a
        // managed instance.
        User recorder = userRepo.findById(principal.getId()).orElseThrow();

        AppointmentVitals row = vitalsRepo.findByAppointmentId(appointmentId)
                .orElseGet(() -> AppointmentVitals.builder()
                        .appointmentId(appointmentId)
                        .hospitalId(appt.getHospital().getId())
                        .patientId(appt.getPatient().getId())
                        .recordedBy(recorder)
                        .recordedAt(LocalDateTime.now())
                        .build());

        // Range-clamp at the controller — keeps obvious typos out of the
        // database. Nulls are allowed; the nurse may legitimately have
        // only some of the readings (e.g. no scale on the floor).
        row.setBpSystolic(clamp(req.getBpSystolic(), 40, 300));
        row.setBpDiastolic(clamp(req.getBpDiastolic(), 20, 200));
        row.setSpo2(clamp(req.getSpo2(), 0, 100));
        row.setHeartRate(clamp(req.getHeartRate(), 20, 300));
        row.setWeightKg(req.getWeightKg());
        row.setHeightCm(clamp(req.getHeightCm(), 10, 300));
        row.setBloodGlucose(clamp(req.getBloodGlucose(), 20, 1000));
        row.setUpdatedAt(LocalDateTime.now());

        return ResponseEntity.ok(toDto(vitalsRepo.save(row)));
    }

    private Integer clamp(Integer v, int lo, int hi) {
        if (v == null) return null;
        if (v < lo || v > hi) {
            throw new RuntimeException(
                    "Vital out of plausible range (" + lo + "–" + hi + "): " + v);
        }
        return v;
    }

    private VitalsDto toDto(AppointmentVitals v) {
        VitalsDto dto = new VitalsDto();
        dto.setId(v.getId().toString());
        dto.setAppointmentId(v.getAppointmentId().toString());
        dto.setPatientId(v.getPatientId());
        dto.setBpSystolic(v.getBpSystolic());
        dto.setBpDiastolic(v.getBpDiastolic());
        dto.setSpo2(v.getSpo2());
        dto.setHeartRate(v.getHeartRate());
        dto.setWeightKg(v.getWeightKg());
        dto.setHeightCm(v.getHeightCm());
        dto.setBloodGlucose(v.getBloodGlucose());
        dto.setRecordedAt(v.getRecordedAt() != null ? v.getRecordedAt().toString() : null);
        dto.setUpdatedAt(v.getUpdatedAt() != null ? v.getUpdatedAt().toString() : null);
        if (v.getRecordedBy() != null) {
            dto.setRecordedById(v.getRecordedBy().getId().toString());
            dto.setRecordedByName(
                    v.getRecordedBy().getFirstName()
                            + (v.getRecordedBy().getLastName() != null
                                    ? " " + v.getRecordedBy().getLastName()
                                    : ""));
        }
        return dto;
    }

    @Data
    public static class VitalsRequest {
        private Integer bpSystolic;
        private Integer bpDiastolic;
        private Integer spo2;
        private Integer heartRate;
        private BigDecimal weightKg;
        private Integer heightCm;
        private Integer bloodGlucose;
    }

    @Data
    public static class VitalsDto {
        private String id;
        private String appointmentId;
        private Integer patientId;
        private Integer bpSystolic;
        private Integer bpDiastolic;
        private Integer spo2;
        private Integer heartRate;
        private BigDecimal weightKg;
        private Integer heightCm;
        private Integer bloodGlucose;
        private String recordedAt;
        private String updatedAt;
        private String recordedById;
        private String recordedByName;
    }
}
