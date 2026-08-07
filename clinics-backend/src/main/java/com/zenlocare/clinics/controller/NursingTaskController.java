package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Admission;
import com.zenlocare.clinics.entity.NursingTask;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.AdmissionRepository;
import com.zenlocare.clinics.repository.NursingTaskRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Nursing task checklist for an IPD admission.
 *
 * GET    /api/ipd/nursing-tasks/{admissionId}                  — list tasks
 * POST   /api/ipd/nursing-tasks/{admissionId}                  — create task
 * PATCH  /api/ipd/nursing-tasks/{admissionId}/{taskId}/complete — mark done
 * PATCH  /api/ipd/nursing-tasks/{admissionId}/{taskId}/skip    — mark skipped
 * DELETE /api/ipd/nursing-tasks/{admissionId}/{taskId}         — delete (PENDING only)
 */
@RestController
@RequestMapping("/api/ipd/nursing-tasks/{admissionId}")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'nurse', 'hospital_admin', 'super_admin')")
public class NursingTaskController {

    private static final Set<String> VALID_CATEGORIES =
            Set.of("MEDICATION","WOUND_CARE","VITALS","HYGIENE","MOBILITY","IV_LINE","OTHER");
    private static final Set<String> VALID_SHIFTS =
            Set.of("MORNING","AFTERNOON","NIGHT","ANY");

    private final NursingTaskRepository taskRepo;
    private final AdmissionRepository   admissionRepo;
    private final UserRepository        userRepo;

    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<NursingTaskDto>> list(
            @PathVariable UUID admissionId,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        return ResponseEntity.ok(
            taskRepo.findByAdmissionIdAndHospitalIdOrderByCreatedAtDesc(admissionId, hospitalId)
                    .stream().map(this::toDto).toList()
        );
    }

    @PostMapping
    @Transactional
    public ResponseEntity<NursingTaskDto> create(
            @PathVariable UUID admissionId,
            @RequestBody CreateTaskRequest req,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);

        if (req.getTaskName() == null || req.getTaskName().isBlank())
            throw new BadRequestException("taskName is required");

        String category = req.getCategory() != null
                ? req.getCategory().trim().toUpperCase() : "OTHER";
        if (!VALID_CATEGORIES.contains(category))
            throw new BadRequestException("Invalid category: " + category);

        String shift = req.getShift() != null
                ? req.getShift().trim().toUpperCase() : "ANY";
        if (!VALID_SHIFTS.contains(shift))
            throw new BadRequestException("shift must be MORNING, AFTERNOON, NIGHT, or ANY");

        User creator = resolveUser(principal);

        NursingTask task = NursingTask.builder()
                .admissionId(admissionId)
                .hospitalId(hospitalId)
                .taskName(req.getTaskName().trim())
                .category(category)
                .shift(shift)
                .dueDate(req.getDueDate())
                .notes(req.getNotes() != null && !req.getNotes().isBlank()
                        ? req.getNotes().trim() : null)
                .createdBy(creator)
                .build();

        taskRepo.save(Objects.requireNonNull(task));
        return ResponseEntity.ok(toDto(task));
    }

    @PatchMapping("/{taskId}/complete")
    @Transactional
    public ResponseEntity<NursingTaskDto> complete(
            @PathVariable UUID admissionId,
            @PathVariable UUID taskId,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        NursingTask task = findTask(taskId, hospitalId, admissionId);

        if ("DONE".equals(task.getStatus()))
            throw new BadRequestException("Task is already marked done");

        User actor = resolveUser(principal);
        task.setStatus("DONE");
        task.setCompletedBy(actor);
        task.setCompletedAt(LocalDateTime.now());

        taskRepo.save(Objects.requireNonNull(task));
        return ResponseEntity.ok(toDto(task));
    }

    @PatchMapping("/{taskId}/skip")
    @Transactional
    public ResponseEntity<NursingTaskDto> skip(
            @PathVariable UUID admissionId,
            @PathVariable UUID taskId,
            @RequestBody(required = false) SkipRequest req,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        NursingTask task = findTask(taskId, hospitalId, admissionId);

        if ("DONE".equals(task.getStatus()))
            throw new BadRequestException("Cannot skip a completed task");
        if ("SKIPPED".equals(task.getStatus()))
            throw new BadRequestException("Task is already skipped");

        if (req != null && req.getNotes() != null && !req.getNotes().isBlank())
            task.setNotes(req.getNotes().trim());

        task.setStatus("SKIPPED");

        taskRepo.save(Objects.requireNonNull(task));
        return ResponseEntity.ok(toDto(task));
    }

    @DeleteMapping("/{taskId}")
    @Transactional
    public ResponseEntity<Void> delete(
            @PathVariable UUID admissionId,
            @PathVariable UUID taskId,
            @AuthenticationPrincipal User principal) {

        UUID hospitalId = resolveAndGuard(admissionId, principal);
        NursingTask task = findTask(taskId, hospitalId, admissionId);

        if (!"PENDING".equals(task.getStatus()))
            throw new BadRequestException("Only PENDING tasks can be deleted");

        taskRepo.delete(task);
        return ResponseEntity.noContent().build();
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

    private NursingTask findTask(UUID taskId, UUID hospitalId, UUID admissionId) {
        NursingTask task = taskRepo.findByIdAndHospitalId(Objects.requireNonNull(taskId), hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found"));
        if (!task.getAdmissionId().equals(admissionId))
            throw new BadRequestException("Task does not belong to this admission");
        return task;
    }

    private NursingTaskDto toDto(NursingTask t) {
        NursingTaskDto dto = new NursingTaskDto();
        dto.setId(t.getId().toString());
        dto.setAdmissionId(t.getAdmissionId().toString());
        dto.setTaskName(t.getTaskName());
        dto.setCategory(t.getCategory());
        dto.setShift(t.getShift());
        dto.setDueDate(t.getDueDate() != null ? t.getDueDate().toString() : null);
        dto.setStatus(t.getStatus());
        dto.setNotes(t.getNotes());
        dto.setCreatedAt(t.getCreatedAt() != null ? t.getCreatedAt().toString() : null);
        if (t.getCreatedBy() != null)  dto.setCreatedByName(fullName(t.getCreatedBy()));
        if (t.getCompletedAt() != null) dto.setCompletedAt(t.getCompletedAt().toString());
        if (t.getCompletedBy() != null) dto.setCompletedByName(fullName(t.getCompletedBy()));
        return dto;
    }

    private static String fullName(User u) {
        return u.getFirstName() + (u.getLastName() != null ? " " + u.getLastName() : "");
    }

    // ── Request / response types ──────────────────────────────────────────────

    @Data public static class CreateTaskRequest {
        private String    taskName;
        private String    category;
        private String    shift;
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        private LocalDate dueDate;
        private String    notes;
    }

    @Data public static class SkipRequest {
        private String notes;
    }

    @Data public static class NursingTaskDto {
        private String id;
        private String admissionId;
        private String taskName;
        private String category;
        private String shift;
        private String dueDate;
        private String status;
        private String notes;
        private String createdByName;
        private String completedByName;
        private String completedAt;
        private String createdAt;
    }
}
