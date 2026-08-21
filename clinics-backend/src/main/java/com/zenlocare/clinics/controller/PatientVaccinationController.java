package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Patient;
import com.zenlocare.clinics.entity.PatientVaccination;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.entity.Vaccine;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.PatientRepository;
import com.zenlocare.clinics.repository.PatientVaccinationRepository;
import com.zenlocare.clinics.repository.UserRepository;
import com.zenlocare.clinics.repository.VaccineRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * A patient's immunization timeline — scheduled and administered doses.
 * Scoped per hospital (tenant isolation), same shape as {@link AllergyController}.
 *
 * GET    /api/patients/{patientId}/vaccinations?hospitalId=
 * POST   /api/patients/{patientId}/vaccinations/generate-schedule
 * POST   /api/patients/{patientId}/vaccinations
 * PUT    /api/patients/{patientId}/vaccinations/{vaccinationId}
 * DELETE /api/patients/{patientId}/vaccinations/{vaccinationId}
 */
@RestController
@RequestMapping("/api/patients/{patientId}/vaccinations")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'nurse', 'hospital_admin', 'super_admin')")
public class PatientVaccinationController {

    private static final Set<String> VALID_STATUSES = Set.of("SCHEDULED", "ADMINISTERED", "SKIPPED");

    private final PatientVaccinationRepository vaccinationRepo;
    private final VaccineRepository            vaccineRepo;
    private final PatientRepository            patientRepo;
    private final UserRepository               userRepo;

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<VaccinationDto>> list(
            @PathVariable Integer patientId,
            @RequestParam UUID hospitalId) {

        return ResponseEntity.ok(
            vaccinationRepo.findByPatientIdAndHospitalIdOrderByScheduledDateAsc(patientId, hospitalId)
                    .stream().map(this::toDto).toList()
        );
    }

    /**
     * Builds out the standard schedule for this patient from the vaccines
     * catalog, using their dob to compute each dose's due date. Skips any
     * catalog vaccine that already has a row for this patient (by vaccineId),
     * so it is safe to call again after doses have been marked given —
     * it only fills in gaps, never duplicates.
     */
    @PostMapping("/generate-schedule")
    @Transactional
    public ResponseEntity<List<VaccinationDto>> generateSchedule(
            @PathVariable Integer patientId,
            @AuthenticationPrincipal User principal) {

        UUID callerHospitalId = callerHospitalId(principal);

        Patient patient = patientRepo.findByIdAndHospitalId(patientId, callerHospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));
        if (patient.getDob() == null) {
            throw new BadRequestException("Patient must have a date of birth to generate a vaccination schedule");
        }

        Set<UUID> alreadyCovered = vaccinationRepo
                .findByPatientIdAndHospitalIdAndVaccineIdIsNotNull(patientId, callerHospitalId)
                .stream().map(PatientVaccination::getVaccineId).collect(java.util.stream.Collectors.toSet());

        List<Vaccine> catalog = vaccineRepo.findByIsActiveTrueOrderByRecommendedAgeDaysAscNameAsc();
        List<PatientVaccination> toCreate = catalog.stream()
                .filter(v -> !alreadyCovered.contains(v.getId()))
                .map(v -> PatientVaccination.builder()
                        .patientId(patientId)
                        .hospitalId(callerHospitalId)
                        .vaccineId(v.getId())
                        .vaccineName(v.getName())
                        .doseNumber(v.getDoseNumber())
                        .scheduledDate(patient.getDob().plusDays(v.getRecommendedAgeDays()))
                        .status("SCHEDULED")
                        .build())
                .toList();

        if (!toCreate.isEmpty()) {
            vaccinationRepo.saveAll(toCreate);
        }

        return ResponseEntity.ok(
            vaccinationRepo.findByPatientIdAndHospitalIdOrderByScheduledDateAsc(patientId, callerHospitalId)
                    .stream().map(this::toDto).toList()
        );
    }

    @PostMapping
    @Transactional
    public ResponseEntity<VaccinationDto> add(
            @PathVariable Integer patientId,
            @RequestBody VaccinationRequest req,
            @AuthenticationPrincipal User principal) {

        UUID callerHospitalId = callerHospitalId(principal);

        if (req.getScheduledDate() == null)
            throw new BadRequestException("scheduledDate is required");

        String vaccineName = req.getVaccineName();
        UUID vaccineId = null;
        if (req.getVaccineId() != null && !req.getVaccineId().isBlank()) {
            Vaccine vaccine = vaccineRepo.findById(UUID.fromString(req.getVaccineId()))
                    .orElseThrow(() -> new ResourceNotFoundException("Vaccine not found in catalog"));
            vaccineId = vaccine.getId();
            vaccineName = vaccine.getName();
        }
        if (vaccineName == null || vaccineName.isBlank())
            throw new BadRequestException("vaccineName is required when vaccineId is not set");

        String status = req.getAdministeredDate() != null ? "ADMINISTERED" : "SCHEDULED";
        if (req.getStatus() != null && !req.getStatus().isBlank()) {
            status = req.getStatus().trim().toUpperCase();
            if (!VALID_STATUSES.contains(status))
                throw new BadRequestException("status must be one of " + VALID_STATUSES);
        }

        User recorder = currentUser(principal);

        PatientVaccination vaccination = PatientVaccination.builder()
                .patientId(patientId)
                .hospitalId(callerHospitalId)
                .vaccineId(vaccineId)
                .vaccineName(vaccineName.trim())
                .doseNumber(req.getDoseNumber())
                .scheduledDate(req.getScheduledDate())
                .administeredDate(req.getAdministeredDate())
                .status(status)
                .batchNumber(blankToNull(req.getBatchNumber()))
                .notes(blankToNull(req.getNotes()))
                .administeredBy("ADMINISTERED".equals(status) ? recorder : null)
                .administeredByNameSnapshot("ADMINISTERED".equals(status) ? displayName(recorder) : null)
                .build();

        vaccinationRepo.save(vaccination);
        return ResponseEntity.ok(toDto(vaccination));
    }

    @PutMapping("/{vaccinationId}")
    @Transactional
    public ResponseEntity<VaccinationDto> update(
            @PathVariable Integer patientId,
            @PathVariable UUID vaccinationId,
            @RequestBody VaccinationRequest req,
            @AuthenticationPrincipal User principal) {

        UUID callerHospitalId = callerHospitalId(principal);

        PatientVaccination vaccination = vaccinationRepo.findByIdAndHospitalId(vaccinationId, callerHospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Vaccination record not found"));
        if (!vaccination.getPatientId().equals(patientId))
            throw new BadRequestException("Vaccination record does not belong to this patient");

        if (req.getScheduledDate() != null) vaccination.setScheduledDate(req.getScheduledDate());
        if (req.getBatchNumber() != null) vaccination.setBatchNumber(blankToNull(req.getBatchNumber()));
        if (req.getNotes() != null) vaccination.setNotes(blankToNull(req.getNotes()));
        if (req.getDoseNumber() != null) vaccination.setDoseNumber(req.getDoseNumber());

        String status = req.getStatus() != null ? req.getStatus().trim().toUpperCase() : null;
        if (status != null) {
            if (!VALID_STATUSES.contains(status))
                throw new BadRequestException("status must be one of " + VALID_STATUSES);
            vaccination.setStatus(status);
        }
        if (req.getAdministeredDate() != null) {
            vaccination.setAdministeredDate(req.getAdministeredDate());
            if (status == null) vaccination.setStatus("ADMINISTERED");
        }
        if ("ADMINISTERED".equals(vaccination.getStatus()) && vaccination.getAdministeredBy() == null) {
            User recorder = currentUser(principal);
            vaccination.setAdministeredBy(recorder);
            vaccination.setAdministeredByNameSnapshot(displayName(recorder));
            if (vaccination.getAdministeredDate() == null) vaccination.setAdministeredDate(LocalDate.now());
        }

        vaccinationRepo.save(vaccination);
        return ResponseEntity.ok(toDto(vaccination));
    }

    @DeleteMapping("/{vaccinationId}")
    @Transactional
    public ResponseEntity<Void> remove(
            @PathVariable Integer patientId,
            @PathVariable UUID vaccinationId,
            @AuthenticationPrincipal User principal) {

        UUID callerHospitalId = callerHospitalId(principal);

        PatientVaccination vaccination = vaccinationRepo.findByIdAndHospitalId(vaccinationId, callerHospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Vaccination record not found"));
        if (!vaccination.getPatientId().equals(patientId))
            throw new BadRequestException("Vaccination record does not belong to this patient");

        vaccinationRepo.delete(vaccination);
        return ResponseEntity.noContent().build();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private User currentUser(User principal) {
        return userRepo.findById(Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    private UUID callerHospitalId(User principal) {
        User recorder = currentUser(principal);
        UUID hospitalId = recorder.getHospital() != null ? recorder.getHospital().getId() : null;
        if (hospitalId == null)
            throw new UnauthorizedException("No hospital associated with your account");
        return hospitalId;
    }

    private static String displayName(User u) {
        return u.getFirstName() + (u.getLastName() != null ? " " + u.getLastName() : "");
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private VaccinationDto toDto(PatientVaccination v) {
        VaccinationDto dto = new VaccinationDto();
        dto.setId(v.getId().toString());
        dto.setPatientId(v.getPatientId());
        dto.setVaccineId(v.getVaccineId() != null ? v.getVaccineId().toString() : null);
        dto.setVaccineName(v.getVaccineName());
        dto.setDoseNumber(v.getDoseNumber());
        dto.setScheduledDate(v.getScheduledDate() != null ? v.getScheduledDate().toString() : null);
        dto.setAdministeredDate(v.getAdministeredDate() != null ? v.getAdministeredDate().toString() : null);
        dto.setStatus(v.getStatus());
        dto.setBatchNumber(v.getBatchNumber());
        dto.setNotes(v.getNotes());
        dto.setAdministeredByName(v.getAdministeredByNameSnapshot());
        dto.setCreatedAt(v.getCreatedAt() != null ? v.getCreatedAt().toString() : null);
        return dto;
    }

    // ── Request / response types ──────────────────────────────────────────────

    @Data
    public static class VaccinationRequest {
        private String vaccineId;
        private String vaccineName;
        private Integer doseNumber;
        private LocalDate scheduledDate;
        private LocalDate administeredDate;
        private String status;
        private String batchNumber;
        private String notes;
    }

    @Data
    public static class VaccinationDto {
        private String  id;
        private Integer patientId;
        private String  vaccineId;
        private String  vaccineName;
        private Integer doseNumber;
        private String  scheduledDate;
        private String  administeredDate;
        private String  status;
        private String  batchNumber;
        private String  notes;
        private String  administeredByName;
        private String  createdAt;
    }
}
