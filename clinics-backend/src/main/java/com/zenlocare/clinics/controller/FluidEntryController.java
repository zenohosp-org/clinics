package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Admission;
import com.zenlocare.clinics.entity.FluidEntry;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.AdmissionRepository;
import com.zenlocare.clinics.repository.FluidEntryRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Fluid Intake-Output (I/O) chart for an IPD admission.
 *
 * GET    /api/ipd/fluid/{admissionId}           — list all entries
 * POST   /api/ipd/fluid/{admissionId}           — add an entry
 * DELETE /api/ipd/fluid/{admissionId}/{entryId} — remove an entry
 */
@RestController
@RequestMapping("/api/ipd/fluid/{admissionId}")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'nurse', 'hospital_admin', 'super_admin')")
public class FluidEntryController {

    private static final Set<String> INTAKE_CATEGORIES =
            Set.of("IV_FLUID", "ORAL", "BLOOD", "MEDICATION", "OTHER_INTAKE");
    private static final Set<String> OUTPUT_CATEGORIES =
            Set.of("URINE", "DRAIN", "VOMIT", "STOOL", "BLOOD_LOSS", "OTHER_OUTPUT");

    private final FluidEntryRepository fluidRepo;
    private final AdmissionRepository  admissionRepo;
    private final UserRepository       userRepo;

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<FluidEntryDto>> list(
            @PathVariable UUID admissionId,
            @AuthenticationPrincipal User principal) {

        UUID callerHospitalId = resolveHospitalId(principal);

        Admission admission = admissionRepo.findById(Objects.requireNonNull(admissionId))
                .orElseThrow(() -> new ResourceNotFoundException("Admission not found"));
        if (!admission.getHospital().getId().equals(callerHospitalId))
            throw new UnauthorizedException("Access denied");

        return ResponseEntity.ok(
            fluidRepo.findByAdmissionIdAndHospitalIdOrderByEntryTimeDesc(admissionId, callerHospitalId)
                     .stream().map(this::toDto).toList()
        );
    }

    @PostMapping
    @Transactional
    public ResponseEntity<FluidEntryDto> add(
            @PathVariable UUID admissionId,
            @RequestBody FluidEntryRequest req,
            @AuthenticationPrincipal User principal) {

        UUID callerHospitalId = resolveHospitalId(principal);

        Admission admission = admissionRepo.findById(Objects.requireNonNull(admissionId))
                .orElseThrow(() -> new ResourceNotFoundException("Admission not found"));
        if (!admission.getHospital().getId().equals(callerHospitalId))
            throw new UnauthorizedException("Access denied");

        // entry_type validation
        if (req.getEntryType() == null || (!req.getEntryType().equals("INTAKE") && !req.getEntryType().equals("OUTPUT")))
            throw new BadRequestException("entryType must be INTAKE or OUTPUT");

        // category validation
        String category = req.getCategory() != null ? req.getCategory().trim().toUpperCase() : "";
        Set<String> allowed = "INTAKE".equals(req.getEntryType()) ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES;
        if (!allowed.contains(category))
            throw new BadRequestException("Invalid category for " + req.getEntryType() + ": " + category);

        if (req.getVolumeMl() == null || req.getVolumeMl() <= 0)
            throw new BadRequestException("volumeMl must be a positive integer");

        User recorder = userRepo.findById(Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        LocalDateTime entryTime = req.getEntryTime() != null ? req.getEntryTime() : LocalDateTime.now();

        FluidEntry entry = FluidEntry.builder()
                .admissionId(admissionId)
                .hospitalId(callerHospitalId)
                .entryType(req.getEntryType())
                .category(category)
                .volumeMl(req.getVolumeMl())
                .notes(req.getNotes() != null && !req.getNotes().isBlank() ? req.getNotes().trim() : null)
                .recordedBy(recorder)
                .entryTime(entryTime)
                .build();

        fluidRepo.save(Objects.requireNonNull(entry));
        return ResponseEntity.ok(toDto(entry));
    }

    @DeleteMapping("/{entryId}")
    @Transactional
    public ResponseEntity<Void> remove(
            @PathVariable UUID admissionId,
            @PathVariable UUID entryId,
            @AuthenticationPrincipal User principal) {

        UUID callerHospitalId = resolveHospitalId(principal);

        FluidEntry entry = fluidRepo.findByIdAndHospitalId(entryId, callerHospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Entry not found"));

        if (!entry.getAdmissionId().equals(admissionId))
            throw new BadRequestException("Entry does not belong to this admission");

        fluidRepo.delete(entry);
        return ResponseEntity.noContent().build();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private UUID resolveHospitalId(User principal) {
        User caller = userRepo.findById(Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (caller.getHospital() == null)
            throw new UnauthorizedException("No hospital associated with your account");
        return caller.getHospital().getId();
    }

    private FluidEntryDto toDto(FluidEntry e) {
        FluidEntryDto dto = new FluidEntryDto();
        dto.setId(e.getId().toString());
        dto.setAdmissionId(e.getAdmissionId().toString());
        dto.setEntryType(e.getEntryType());
        dto.setCategory(e.getCategory());
        dto.setVolumeMl(e.getVolumeMl());
        dto.setNotes(e.getNotes());
        dto.setEntryTime(e.getEntryTime() != null ? e.getEntryTime().toString() : null);
        dto.setCreatedAt(e.getCreatedAt() != null ? e.getCreatedAt().toString() : null);
        if (e.getRecordedBy() != null) {
            dto.setRecordedByName(
                e.getRecordedBy().getFirstName() +
                (e.getRecordedBy().getLastName() != null ? " " + e.getRecordedBy().getLastName() : "")
            );
        }
        return dto;
    }

    // ── Request / response types ──────────────────────────────────────────────

    @Data
    public static class FluidEntryRequest {
        private String        entryType;
        private String        category;
        private Integer       volumeMl;
        private String        notes;
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        private LocalDateTime entryTime;
    }

    @Data
    public static class FluidEntryDto {
        private String  id;
        private String  admissionId;
        private String  entryType;
        private String  category;
        private Integer volumeMl;
        private String  notes;
        private String  recordedByName;
        private String  entryTime;
        private String  createdAt;
    }
}
