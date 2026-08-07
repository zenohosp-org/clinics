package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Admission;
import com.zenlocare.clinics.entity.PatientReferral;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.AdmissionRepository;
import com.zenlocare.clinics.repository.PatientReferralRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
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
 * Referral tracking for an IPD admission.
 *
 * GET    /api/ipd/referrals/{admissionId}                   — list
 * POST   /api/ipd/referrals/{admissionId}                   — create
 * PATCH  /api/ipd/referrals/{admissionId}/{id}/accept       — mark accepted
 * PATCH  /api/ipd/referrals/{admissionId}/{id}/complete     — mark completed
 * PATCH  /api/ipd/referrals/{admissionId}/{id}/cancel       — cancel
 */
@RestController
@RequestMapping("/api/ipd/referrals/{admissionId}")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'nurse', 'hospital_admin', 'super_admin')")
public class PatientReferralController {

    private static final Set<String> VALID_TYPES      = Set.of("INTERNAL", "EXTERNAL");
    private static final Set<String> VALID_PRIORITIES = Set.of("ROUTINE", "URGENT", "EMERGENCY");

    private final PatientReferralRepository referralRepo;
    private final AdmissionRepository       admissionRepo;
    private final UserRepository            userRepo;

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<ReferralDto>> list(
            @PathVariable UUID admissionId,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        return ResponseEntity.ok(
            referralRepo.findByAdmissionIdAndHospitalIdOrderByCreatedAtDesc(admissionId, hospitalId)
                        .stream().map(this::toDto).toList()
        );
    }

    @PostMapping
    @Transactional
    public ResponseEntity<ReferralDto> create(
            @PathVariable UUID admissionId,
            @RequestBody CreateReferralRequest req,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);

        if (req.getReferredToName() == null || req.getReferredToName().isBlank())
            throw new BadRequestException("referredToName is required");
        if (req.getReason() == null || req.getReason().isBlank())
            throw new BadRequestException("reason is required");

        String type = req.getReferredToType() != null
                ? req.getReferredToType().trim().toUpperCase() : "INTERNAL";
        if (!VALID_TYPES.contains(type))
            throw new BadRequestException("referredToType must be INTERNAL or EXTERNAL");

        String priority = req.getPriority() != null
                ? req.getPriority().trim().toUpperCase() : "ROUTINE";
        if (!VALID_PRIORITIES.contains(priority))
            throw new BadRequestException("priority must be ROUTINE, URGENT, or EMERGENCY");

        User referrer = resolveUser(principal);

        PatientReferral referral = PatientReferral.builder()
                .admissionId(admissionId)
                .hospitalId(hospitalId)
                .referredToName(req.getReferredToName().trim())
                .referredToType(type)
                .reason(req.getReason().trim())
                .priority(priority)
                .notes(req.getNotes() != null && !req.getNotes().isBlank()
                        ? req.getNotes().trim() : null)
                .referredBy(referrer)
                .build();

        referralRepo.save(Objects.requireNonNull(referral));
        return ResponseEntity.ok(toDto(referral));
    }

    @PatchMapping("/{referralId}/accept")
    @Transactional
    public ResponseEntity<ReferralDto> accept(
            @PathVariable UUID admissionId,
            @PathVariable UUID referralId,
            @RequestBody(required = false) AcceptRequest req,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        PatientReferral referral = findReferral(referralId, hospitalId, admissionId);

        if (!"PENDING".equals(referral.getStatus()))
            throw new BadRequestException("Only PENDING referrals can be accepted");

        referral.setStatus("ACCEPTED");
        referral.setAcceptedAt(LocalDateTime.now());
        referral.setRespondedBy(resolveUser(principal));
        if (req != null && req.getAcceptedByName() != null && !req.getAcceptedByName().isBlank())
            referral.setAcceptedByName(req.getAcceptedByName().trim());
        if (req != null && req.getNotes() != null && !req.getNotes().isBlank())
            referral.setNotes(req.getNotes().trim());

        referralRepo.save(Objects.requireNonNull(referral));
        return ResponseEntity.ok(toDto(referral));
    }

    @PatchMapping("/{referralId}/complete")
    @Transactional
    public ResponseEntity<ReferralDto> complete(
            @PathVariable UUID admissionId,
            @PathVariable UUID referralId,
            @RequestBody(required = false) CompleteRequest req,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        PatientReferral referral = findReferral(referralId, hospitalId, admissionId);

        if ("COMPLETED".equals(referral.getStatus()))
            throw new BadRequestException("Referral is already completed");
        if ("CANCELLED".equals(referral.getStatus()))
            throw new BadRequestException("Cannot complete a cancelled referral");

        referral.setStatus("COMPLETED");
        referral.setCompletedAt(LocalDateTime.now());
        referral.setRespondedBy(resolveUser(principal));
        if (req != null && req.getNotes() != null && !req.getNotes().isBlank())
            referral.setNotes(req.getNotes().trim());

        referralRepo.save(Objects.requireNonNull(referral));
        return ResponseEntity.ok(toDto(referral));
    }

    @PatchMapping("/{referralId}/cancel")
    @Transactional
    public ResponseEntity<ReferralDto> cancel(
            @PathVariable UUID admissionId,
            @PathVariable UUID referralId,
            @RequestBody(required = false) CancelRequest req,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        PatientReferral referral = findReferral(referralId, hospitalId, admissionId);

        if ("COMPLETED".equals(referral.getStatus()))
            throw new BadRequestException("Cannot cancel a completed referral");
        if ("CANCELLED".equals(referral.getStatus()))
            throw new BadRequestException("Referral is already cancelled");

        referral.setStatus("CANCELLED");
        referral.setRespondedBy(resolveUser(principal));
        if (req != null && req.getNotes() != null && !req.getNotes().isBlank())
            referral.setNotes(req.getNotes().trim());

        referralRepo.save(Objects.requireNonNull(referral));
        return ResponseEntity.ok(toDto(referral));
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private UUID resolveAndGuard(UUID admissionId, User principal) {
        User caller = resolveUser(principal);
        Admission admission = admissionRepo.findById(Objects.requireNonNull(admissionId))
                .orElseThrow(() -> new ResourceNotFoundException("Admission not found"));
        if (caller.getHospital() == null)
            throw new UnauthorizedException("No hospital associated with your account");
        if (!admission.getHospital().getId().equals(caller.getHospital().getId()))
            throw new UnauthorizedException("Access denied");
        return caller.getHospital().getId();
    }

    private User resolveUser(User principal) {
        return userRepo.findById(Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    private PatientReferral findReferral(UUID referralId, UUID hospitalId, UUID admissionId) {
        PatientReferral r = referralRepo.findByIdAndHospitalId(Objects.requireNonNull(referralId), hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Referral not found"));
        if (!r.getAdmissionId().equals(admissionId))
            throw new BadRequestException("Referral does not belong to this admission");
        return r;
    }

    private ReferralDto toDto(PatientReferral r) {
        ReferralDto dto = new ReferralDto();
        dto.setId(r.getId().toString());
        dto.setAdmissionId(r.getAdmissionId().toString());
        dto.setReferredToName(r.getReferredToName());
        dto.setReferredToType(r.getReferredToType());
        dto.setReason(r.getReason());
        dto.setPriority(r.getPriority());
        dto.setStatus(r.getStatus());
        dto.setNotes(r.getNotes());
        dto.setCreatedAt(r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
        if (r.getReferredBy() != null)  dto.setReferredByName(fullName(r.getReferredBy()));
        if (r.getAcceptedAt() != null)  dto.setAcceptedAt(r.getAcceptedAt().toString());
        dto.setAcceptedByName(r.getAcceptedByName());
        if (r.getCompletedAt() != null) dto.setCompletedAt(r.getCompletedAt().toString());
        if (r.getRespondedBy() != null) dto.setRespondedByName(fullName(r.getRespondedBy()));
        return dto;
    }

    private static String fullName(User u) {
        return u.getFirstName() + (u.getLastName() != null ? " " + u.getLastName() : "");
    }

    // ── Request / response types ──────────────────────────────────────────────

    @Data public static class CreateReferralRequest {
        private String referredToName;
        private String referredToType;
        private String reason;
        private String priority;
        private String notes;
    }

    @Data public static class AcceptRequest {
        private String acceptedByName;
        private String notes;
    }

    @Data public static class CompleteRequest {
        private String notes;
    }

    @Data public static class CancelRequest {
        private String notes;
    }

    @Data public static class ReferralDto {
        private String id;
        private String admissionId;
        private String referredToName;
        private String referredToType;
        private String reason;
        private String priority;
        private String status;
        private String notes;
        private String referredByName;
        private String acceptedAt;
        private String acceptedByName;
        private String completedAt;
        private String respondedByName;
        private String createdAt;
    }
}
