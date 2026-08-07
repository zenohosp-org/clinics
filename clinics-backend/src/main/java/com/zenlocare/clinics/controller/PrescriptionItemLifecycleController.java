package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.PrescriptionReturnDtos;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.AdmissionRepository;
import com.zenlocare.clinics.repository.PrescriptionItemRepository;
import com.zenlocare.clinics.repository.UserRepository;
import com.zenlocare.clinics.service.PrescriptionReturnService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Manages the ACTIVE → STOPPED lifecycle of a prescription order.
 *
 * PATCH /api/ipd/prescription-items/{itemId}/stop
 *   Stops an active order with a required clinical reason. The order row is
 *   never deleted — MAR rows reference it via FK (order_id) and must remain
 *   intact for medico-legal audit purposes.
 *
 * Only doctors, hospital admins, and super admins may stop an order; nurses
 * and general staff cannot.
 */
@RestController
@RequestMapping("/api/ipd/prescription-items")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'hospital_admin', 'super_admin')")
public class PrescriptionItemLifecycleController {

    private final PrescriptionItemRepository prescriptionItemRepo;
    private final AdmissionRepository        admissionRepo;
    private final UserRepository             userRepo;
    private final PrescriptionReturnService  prescriptionReturnService;

    @PatchMapping("/{itemId}/stop")
    @Transactional
    public ResponseEntity<StopOrderDto> stop(
            @PathVariable UUID itemId,
            @RequestBody StopRequest req,
            @AuthenticationPrincipal User principal) {

        if (req.getReason() == null || req.getReason().isBlank())
            throw new BadRequestException("reason is required to stop an order");

        var order = prescriptionItemRepo.findById(java.util.Objects.requireNonNull(itemId))
                .orElseThrow(() -> new ResourceNotFoundException("Prescription order not found"));

        if ("STOPPED".equals(order.getStatus()))
            throw new BadRequestException("Order is already stopped");

        // Derive the admission from the parent prescription record.
        // This is the same traversal used by MedicationAdministrationController.
        UUID orderAdmissionId = order.getRecord().getAdmissionId();
        if (orderAdmissionId == null)
            throw new BadRequestException("Order is not associated with an IPD admission");

        var admission = admissionRepo.findById(orderAdmissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Admission not found"));

        User caller = userRepo.findById(java.util.Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UUID admissionHospitalId = admission.getHospital() != null ? admission.getHospital().getId() : null;
        UUID callerHospitalId    = caller.getHospital()    != null ? caller.getHospital().getId()    : null;

        if (callerHospitalId == null || !callerHospitalId.equals(admissionHospitalId))
            throw new UnauthorizedException("Admission does not belong to your hospital");

        order.setStatus("STOPPED");
        order.setStoppedAt(LocalDateTime.now());
        order.setStoppedBy(caller);
        order.setStopReason(req.getReason().trim());

        prescriptionItemRepo.save(order);

        StopOrderDto dto = new StopOrderDto();
        dto.setOrderId(order.getId().toString());
        dto.setStatus("STOPPED");
        dto.setStoppedAt(order.getStoppedAt().toString());
        dto.setStoppedByName(caller.getFirstName() +
                (caller.getLastName() != null ? " " + caller.getLastName() : ""));
        dto.setStopReason(order.getStopReason());
        return ResponseEntity.ok(dto);
    }

    /**
     * Nurse-initiated ward return for an IPD prescription order. Optionally
     * stops the order in the same transaction. The class-level @PreAuthorize
     * is overridden here to also include {@code nurse} — clinically the nurse
     * is the one who carries unused units back to pharmacy and starts the
     * paper trail.
     *
     * Heavy lifting (validation, optimistic hold on returned_qty, dispense
     * status recompute, idempotency) lives in {@link PrescriptionReturnService}
     * so the same logic stays reusable from other entry points (e.g. a future
     * IPD-doctor "switch drug" action).
     */
    @PostMapping("/{itemId}/return")
    @PreAuthorize("hasAnyRole('nurse', 'doctor', 'hospital_admin', 'super_admin')")
    public ResponseEntity<PrescriptionReturnDtos.InitiateResponse> initiateReturn(
            @PathVariable UUID itemId,
            @RequestBody PrescriptionReturnDtos.InitiateRequest req,
            @AuthenticationPrincipal User principal) {
        return ResponseEntity.ok(prescriptionReturnService.initiate(itemId, req, principal));
    }

    // ── Request / response types ──────────────────────────────────────────────

    @Data
    public static class StopRequest {
        private String reason;
    }

    @Data
    public static class StopOrderDto {
        private String orderId;
        private String status;
        private String stoppedAt;
        private String stoppedByName;
        private String stopReason;
    }
}
