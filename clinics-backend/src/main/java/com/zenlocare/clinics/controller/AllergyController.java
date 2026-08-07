package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.PatientAllergy;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.PatientAllergyRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Patient allergy CRUD — scoped per hospital (tenant isolation).
 *
 * GET    /api/patients/{patientId}/allergies?hospitalId=
 * POST   /api/patients/{patientId}/allergies
 * DELETE /api/patients/{patientId}/allergies/{allergyId}
 */
@RestController
@RequestMapping("/api/patients/{patientId}/allergies")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'nurse', 'hospital_admin', 'super_admin')")
public class AllergyController {

    private static final Set<String> VALID_SEVERITIES = Set.of("MILD", "MODERATE", "SEVERE", "UNKNOWN");

    private final PatientAllergyRepository allergyRepo;
    private final UserRepository           userRepo;

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<AllergyDto>> list(
            @PathVariable Integer patientId,
            @RequestParam UUID hospitalId) {

        return ResponseEntity.ok(
            allergyRepo.findByPatientIdAndHospitalIdOrderByCreatedAtAsc(patientId, hospitalId)
                       .stream().map(this::toDto).toList()
        );
    }

    @PostMapping
    @Transactional
    public ResponseEntity<AllergyDto> add(
            @PathVariable Integer patientId,
            @RequestBody AllergyRequest req,
            @AuthenticationPrincipal User principal) {

        if (req.getAllergen() == null || req.getAllergen().isBlank())
            throw new BadRequestException("allergen is required");

        User recorder = userRepo.findById(java.util.Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UUID callerHospitalId = recorder.getHospital() != null ? recorder.getHospital().getId() : null;
        if (callerHospitalId == null)
            throw new UnauthorizedException("No hospital associated with your account");

        String severity = req.getSeverity() != null
                ? req.getSeverity().trim().toUpperCase() : "UNKNOWN";
        if (!VALID_SEVERITIES.contains(severity))
            throw new BadRequestException("severity must be one of MILD, MODERATE, SEVERE, UNKNOWN");

        PatientAllergy allergy = PatientAllergy.builder()
                .patientId(patientId)
                .hospitalId(callerHospitalId)
                .allergen(req.getAllergen().trim())
                .reaction(req.getReaction() != null && !req.getReaction().isBlank()
                        ? req.getReaction().trim() : null)
                .severity(severity)
                .recordedBy(recorder)
                .build();

        allergyRepo.save(allergy);
        return ResponseEntity.ok(toDto(allergy));
    }

    @DeleteMapping("/{allergyId}")
    @Transactional
    public ResponseEntity<Void> remove(
            @PathVariable Integer patientId,
            @PathVariable UUID allergyId,
            @AuthenticationPrincipal User principal) {

        User caller = userRepo.findById(java.util.Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UUID callerHospitalId = caller.getHospital() != null ? caller.getHospital().getId() : null;

        PatientAllergy allergy = allergyRepo.findByIdAndHospitalId(allergyId, callerHospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Allergy not found"));

        if (!allergy.getPatientId().equals(patientId))
            throw new BadRequestException("Allergy does not belong to this patient");

        allergyRepo.delete(allergy);
        return ResponseEntity.noContent().build();
    }

    // ── DTO mapping ───────────────────────────────────────────────────────────

    private AllergyDto toDto(PatientAllergy a) {
        AllergyDto dto = new AllergyDto();
        dto.setId(a.getId().toString());
        dto.setPatientId(a.getPatientId());
        dto.setAllergen(a.getAllergen());
        dto.setReaction(a.getReaction());
        dto.setSeverity(a.getSeverity());
        dto.setCreatedAt(a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
        if (a.getRecordedBy() != null) {
            dto.setRecordedByName(a.getRecordedBy().getFirstName() +
                    (a.getRecordedBy().getLastName() != null
                            ? " " + a.getRecordedBy().getLastName() : ""));
        }
        return dto;
    }

    // ── Request / response types ──────────────────────────────────────────────

    @Data
    public static class AllergyRequest {
        private String allergen;
        private String reaction;
        private String severity;
    }

    @Data
    public static class AllergyDto {
        private String  id;
        private Integer patientId;
        private String  allergen;
        private String  reaction;
        private String  severity;
        private String  recordedByName;
        private String  createdAt;
    }
}
