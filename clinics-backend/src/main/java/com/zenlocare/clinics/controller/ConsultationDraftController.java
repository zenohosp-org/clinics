package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.ConsultationDraft;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.ConsultationDraftRepository;
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
import java.util.UUID;

/**
 * Server-side autosave for the in-flight consultation modal.
 *
 * Why server-side and not localStorage: the doctor frequently swaps devices
 * (consult room PC → tablet → reception kiosk) and we don't want a half-typed
 * prescription to evaporate because a tab closed. The row holds the modal's
 * serialised form state as JSON and is cleared once Save Consultation
 * succeeds, so finalised records still live exclusively in patient_records.
 */
@RestController
@RequestMapping("/api/consultation-drafts")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'hospital_admin', 'super_admin')")
public class ConsultationDraftController {

    private final ConsultationDraftRepository draftRepo;
    private final UserRepository userRepo;

    /** Single draft lookup — the modal calls this when it opens to hydrate from autosave. */
    @GetMapping("/by-appointment/{appointmentId}")
    public ResponseEntity<DraftDto> get(@PathVariable UUID appointmentId) {
        return draftRepo.findByAppointmentId(appointmentId)
                .map(d -> ResponseEntity.ok(toDto(d)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * Bulk listing scoped to the hospital — the dashboard uses this to mark
     * which rows have an unfinished consultation so the doctor can pick up
     * where they left off after closing the tab.
     */
    @GetMapping
    public ResponseEntity<List<DraftDto>> listForHospital(@RequestParam UUID hospitalId) {
        List<DraftDto> dtos = draftRepo.findByHospitalId(hospitalId).stream().map(this::toDto).toList();
        return ResponseEntity.ok(dtos);
    }

    /**
     * Upsert keyed on appointmentId. Debounced from the frontend (~1.5s after
     * the last keystroke) so each save is one row write rather than a stream
     * of partial writes. The whole modal state is JSON in `payload`.
     */
    @PutMapping("/by-appointment/{appointmentId}")
    @Transactional
    public ResponseEntity<DraftDto> upsert(
            @PathVariable UUID appointmentId,
            @RequestBody UpsertRequest req,
            @AuthenticationPrincipal User principal) {

        // Re-fetch the creator inside the TX — see RecordService.doCreate for
        // the full rationale (detached principal vs. EAGER role proxy).
        User creator = userRepo.findById(principal.getId()).orElseThrow();

        ConsultationDraft draft = draftRepo.findByAppointmentId(appointmentId)
                .orElseGet(() -> ConsultationDraft.builder()
                        .appointmentId(appointmentId)
                        .hospitalId(req.getHospitalId())
                        .patientId(req.getPatientId())
                        .createdBy(creator)
                        .createdAt(LocalDateTime.now())
                        .build());

        draft.setPayload(req.getPayload());
        draft.setUpdatedAt(LocalDateTime.now());
        // Patient / hospital can shift only if this is a brand-new row; for
        // an existing draft we trust the row's original scope.
        if (draft.getHospitalId() == null) draft.setHospitalId(req.getHospitalId());
        if (draft.getPatientId() == null)  draft.setPatientId(req.getPatientId());

        return ResponseEntity.ok(toDto(draftRepo.save(draft)));
    }

    /** Called after Save Consultation lands the final patient_record. */
    @DeleteMapping("/by-appointment/{appointmentId}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable UUID appointmentId) {
        draftRepo.deleteByAppointmentId(appointmentId);
        return ResponseEntity.noContent().build();
    }

    private DraftDto toDto(ConsultationDraft d) {
        DraftDto dto = new DraftDto();
        dto.setId(d.getId().toString());
        dto.setAppointmentId(d.getAppointmentId().toString());
        dto.setHospitalId(d.getHospitalId().toString());
        dto.setPatientId(d.getPatientId());
        dto.setPayload(d.getPayload());
        dto.setUpdatedAt(d.getUpdatedAt().toString());
        if (d.getCreatedBy() != null) {
            dto.setCreatedById(d.getCreatedBy().getId().toString());
        }
        return dto;
    }

    @Data
    public static class UpsertRequest {
        private UUID hospitalId;
        private Integer patientId;
        private String payload;
    }

    @Data
    public static class DraftDto {
        private String id;
        private String appointmentId;
        private String hospitalId;
        private Integer patientId;
        private String payload;
        private String updatedAt;
        private String createdById;
    }
}
