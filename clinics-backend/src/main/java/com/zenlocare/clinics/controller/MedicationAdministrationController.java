package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.MedicationAdministration;
import com.zenlocare.clinics.entity.PrescriptionItem;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.AdmissionRepository;
import com.zenlocare.clinics.repository.MedicationAdministrationRepository;
import com.zenlocare.clinics.repository.PrescriptionItemRepository;
import com.zenlocare.clinics.repository.UserRepository;
import com.zenlocare.clinics.util.PersonNames;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Medication Administration Record (MAR) endpoints for IPD admissions.
 *
 * GET  /api/ipd/mar/admission/{admissionId}
 *   Returns every prescription order for the admission as an OrderCardDto, each
 *   with its embedded list of administration events (chronological, oldest-first).
 *   Two queries — one for orders (prescription_items JOIN patient_records),
 *   one for admin rows — joined in Java by orderId so the SQL stays simple.
 *
 * POST /api/ipd/mar
 *   Logs one administration event against an existing prescription order.
 *   status must be GIVEN, HELD, or REFUSED. reason is required for HELD/REFUSED.
 *   hospital_id, patient_id, and admission_id are always derived server-side from
 *   the admission entity; they are never accepted from the request body.
 */
@RestController
@RequestMapping("/api/ipd/mar")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'hospital_admin', 'super_admin')")
public class MedicationAdministrationController {

    private static final Set<String> VALID_STATUSES = Set.of("GIVEN", "HELD", "REFUSED");

    private final MedicationAdministrationRepository medAdminRepo;
    private final PrescriptionItemRepository         prescriptionItemRepo;
    private final AdmissionRepository                admissionRepo;
    private final UserRepository                     userRepo;
    private final com.zenlocare.clinics.repository.PrescriptionReturnRequestRepository
                                                     returnRequestRepo;

    /**
     * All prescription orders for one admission with their administration history.
     *
     * readOnly transaction keeps the Hibernate session open for any lazy proxy
     * walk inside the DTO mappers (administeredBy on MedicationAdministration rows).
     */
    @GetMapping("/admission/{admissionId}")
    @Transactional(readOnly = true)
    public ResponseEntity<List<OrderCardDto>> list(
            @PathVariable UUID admissionId,
            @AuthenticationPrincipal User principal) {

        User caller = userRepo.findById(java.util.Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UUID hospitalId = caller.getHospital() != null ? caller.getHospital().getId() : null;

        List<PrescriptionItem> orders = (hospitalId != null)
                ? prescriptionItemRepo.findByAdmissionIdAndHospitalId(admissionId, hospitalId)
                : List.of();

        List<MedicationAdministration> admins =
                medAdminRepo.findByAdmissionIdOrderByAdministeredAtAsc(admissionId);

        Map<UUID, List<MedicationAdministration>> byOrder = admins.stream()
                .collect(Collectors.groupingBy(MedicationAdministration::getOrderId));

        // Resolve the drug-switch chain in-memory — both old and new orders live
        // on the same admission, so they're already in the `orders` list and we
        // can skip an extra round-trip to the DB.
        Map<UUID, PrescriptionItem> byId = orders.stream()
                .collect(Collectors.toMap(PrescriptionItem::getId, pi -> pi, (a, b) -> a));
        Map<UUID, PrescriptionItem> replacementByOldId = new java.util.HashMap<>();
        for (PrescriptionItem pi : orders) {
            UUID oldId = pi.getReplacesPrescriptionItemId();
            if (oldId != null) replacementByOldId.putIfAbsent(oldId, pi);
        }

        // Per-order REQUESTED return qty, one batched query. Empty admissions
        // skip the call entirely so we don't burn a round-trip on the common
        // "no orders yet" path.
        Map<UUID, Integer> pendingReturnByItemId = new java.util.HashMap<>();
        if (!orders.isEmpty()) {
            var orderIds = orders.stream().map(PrescriptionItem::getId).toList();
            for (Object[] row : returnRequestRepo.sumPendingByItemIds(orderIds)) {
                if (row == null || row[0] == null) continue;
                pendingReturnByItemId.put((UUID) row[0], ((Number) row[1]).intValue());
            }
        }

        List<OrderCardDto> result = orders.stream()
                .map(item -> toOrderCardDto(
                        item,
                        byOrder.getOrDefault(item.getId(), List.of()),
                        byId,
                        replacementByOldId,
                        pendingReturnByItemId.getOrDefault(item.getId(), 0)))
                .toList();

        return ResponseEntity.ok(result);
    }

    /**
     * Log one administration event against an existing prescription order.
     *
     * Validation order:
     *  1. Required fields present (admissionId, orderId, administeredAt, status).
     *  2. status is one of GIVEN, HELD, REFUSED.
     *  3. reason is present (non-blank) when status is HELD or REFUSED.
     *  4. Admission exists.
     *  5. Recorder's hospital matches the admission's hospital (cross-tenant guard).
     *  6. Order (prescription item) exists.
     *  7. Order's parent record admissionId matches the stated admissionId.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<AdminDto> create(
            @RequestBody MarRequest req,
            @AuthenticationPrincipal User principal) {

        if (req.getAdmissionId() == null)
            throw new BadRequestException("admissionId is required");
        if (req.getOrderId() == null)
            throw new BadRequestException("orderId is required");
        if (req.getAdministeredAt() == null)
            throw new BadRequestException("administeredAt is required");
        if (req.getStatus() == null || req.getStatus().isBlank())
            throw new BadRequestException("status is required");

        String status = req.getStatus().trim().toUpperCase();
        if (!VALID_STATUSES.contains(status))
            throw new BadRequestException("status must be one of GIVEN, HELD, or REFUSED");

        if (("HELD".equals(status) || "REFUSED".equals(status))
                && (req.getReason() == null || req.getReason().isBlank()))
            throw new BadRequestException("reason is required when status is HELD or REFUSED");

        var admission = admissionRepo.findById(java.util.Objects.requireNonNull(req.getAdmissionId()))
                .orElseThrow(() -> new ResourceNotFoundException("Admission not found"));

        User recorder = userRepo.findById(java.util.Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UUID admissionHospitalId = admission.getHospital() != null ? admission.getHospital().getId() : null;
        UUID recorderHospitalId  = recorder.getHospital()  != null ? recorder.getHospital().getId()  : null;
        if (recorderHospitalId == null || !recorderHospitalId.equals(admissionHospitalId))
            throw new UnauthorizedException("Admission does not belong to your hospital");

        // Lazy load works here because the method is @Transactional.
        var order = prescriptionItemRepo.findById(java.util.Objects.requireNonNull(req.getOrderId()))
                .orElseThrow(() -> new ResourceNotFoundException("Prescription order not found"));

        var orderAdmissionId = order.getRecord().getAdmissionId();
        if (orderAdmissionId == null || !orderAdmissionId.equals(req.getAdmissionId()))
            throw new BadRequestException("Prescription order does not belong to this admission");

        if ("STOPPED".equals(order.getStatus()))
            throw new BadRequestException("Cannot record a dose against a stopped order");

        MedicationAdministration entity = MedicationAdministration.builder()
                .hospitalId(admissionHospitalId)
                .admissionId(req.getAdmissionId())
                .orderId(req.getOrderId())
                .patientId(admission.getPatient().getId())
                .administeredAt(req.getAdministeredAt())
                .administeredBy(recorder)
                // Frozen now: who gave this dose is a medico-legal fact and
                // must not change when this user is renamed or leaves.
                .administeredByNameSnapshot(PersonNames.of(recorder))
                .status(status)
                .doseGiven(blank(req.getDoseGiven())  ? null : req.getDoseGiven().trim())
                .reason(blank(req.getReason())         ? null : req.getReason().trim())
                .notes(blank(req.getNotes())            ? null : req.getNotes().trim())
                .build();

        return ResponseEntity.ok(toAdminDto(medAdminRepo.save(entity)));
    }

    // ── DTO mapping ───────────────────────────────────────────────────────────

    private OrderCardDto toOrderCardDto(PrescriptionItem item,
                                        List<MedicationAdministration> admins,
                                        Map<UUID, PrescriptionItem> byId,
                                        Map<UUID, PrescriptionItem> replacementByOldId,
                                        int pendingReturnQty) {
        OrderCardDto dto = new OrderCardDto();
        dto.setOrderId(item.getId().toString());
        dto.setDrugName(item.getDrugName());
        dto.setDrugStrength(item.getDrugStrength());
        dto.setDrugForm(item.getDrugForm());
        dto.setDose(item.getDose());
        dto.setFrequency(item.getFrequency() != null ? item.getFrequency().name() : null);
        dto.setRoute(item.getRoute()          != null ? item.getRoute().name()     : null);
        dto.setInstructions(item.getInstructions());
        dto.setAllergyOverrideReason(item.getAllergyOverrideReason());

        var rec = item.getRecord();
        dto.setPrescribedAt(rec.getCreatedAt() != null ? rec.getCreatedAt().toString() : null);
        // Prefer the attending/prescribing doctor over the record's creator —
        // a staff member may enter the prescription on behalf of a doctor.
        var doc = rec.getAttendingDoctor() != null ? rec.getAttendingDoctor() : rec.getCreatedBy();
        if (doc != null) {
            dto.setPrescribedBy(doc.getFirstName() +
                    (doc.getLastName() != null ? " " + doc.getLastName() : ""));
        }

        dto.setStatus(item.getStatus());
        if ("STOPPED".equals(item.getStatus())) {
            dto.setStoppedAt(item.getStoppedAt() != null ? item.getStoppedAt().toString() : null);
            dto.setStopReason(item.getStopReason());
            if (item.getStoppedBy() != null) {
                var stopper = item.getStoppedBy();
                dto.setStoppedByName(stopper.getFirstName() +
                        (stopper.getLastName() != null ? " " + stopper.getLastName() : ""));
            }
        }

        // Quantities used by the MAR-side "Return unused" action:
        //   - quantity:     total prescribed
        //   - dispensedQty: pharmacy-issued tally
        //   - returnedQty:  optimistically incremented on initiate, decremented on reject
        // The UI gates the button on returnable = dispensedQty - returnedQty > 0
        // and caps the input at the same delta. dispenseStatus is surfaced so the
        // queue chip can show PENDING / PARTIAL / DISPENSED without a second call.
        dto.setQuantity(item.getQuantity());
        dto.setDispensedQty(item.getDispensedQty());
        dto.setReturnedQty(item.getReturnedQty());
        dto.setPendingReturnQty(pendingReturnQty);
        dto.setDispenseStatus(item.getDispenseStatus() != null ? item.getDispenseStatus().name() : null);

        // "← replaces {old drug}" — this card is the NEW order in a switch.
        if (item.getReplacesPrescriptionItemId() != null) {
            dto.setReplacesPrescriptionItemId(item.getReplacesPrescriptionItemId().toString());
            PrescriptionItem oldItem = byId.get(item.getReplacesPrescriptionItemId());
            if (oldItem != null) {
                dto.setReplacesDrugName(joinDrugLabel(oldItem.getDrugName(), oldItem.getDrugStrength()));
            }
        }
        // "→ switched to {new drug}" — this card is the OLD order in a switch.
        PrescriptionItem replacement = replacementByOldId.get(item.getId());
        if (replacement != null) {
            dto.setReplacedByPrescriptionItemId(replacement.getId().toString());
            dto.setReplacedByDrugName(joinDrugLabel(replacement.getDrugName(), replacement.getDrugStrength()));
        }

        dto.setAdministrations(admins.stream().map(this::toAdminDto).toList());
        return dto;
    }

    private static String joinDrugLabel(String name, String strength) {
        if (name == null) return "(unknown)";
        if (strength == null || strength.isBlank()) return name.trim();
        return name.trim() + " " + strength.trim();
    }

    private AdminDto toAdminDto(MedicationAdministration a) {
        AdminDto dto = new AdminDto();
        dto.setId(a.getId().toString());
        dto.setAdministeredAt(a.getAdministeredAt() != null ? a.getAdministeredAt().toString() : null);
        dto.setStatus(a.getStatus());
        dto.setDoseGiven(a.getDoseGiven());
        dto.setReason(a.getReason());
        dto.setNotes(a.getNotes());
        dto.setCreatedAt(a.getCreatedAt() != null ? a.getCreatedAt().toString() : null);
        if (a.getAdministeredBy() != null) {
            var nurse = a.getAdministeredBy();
            dto.setAdministeredById(nurse.getId().toString());
            dto.setAdministeredByName(nurse.getFirstName() +
                    (nurse.getLastName() != null ? " " + nurse.getLastName() : ""));
        }
        return dto;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    // ── Inner request / response types ────────────────────────────────────────

    @Data
    public static class MarRequest {
        private UUID          admissionId;
        private UUID          orderId;
        private LocalDateTime administeredAt;
        /** GIVEN | HELD | REFUSED — validated before persistence. */
        private String        status;
        private String        doseGiven;
        /** Required when status is HELD or REFUSED. */
        private String        reason;
        private String        notes;
    }

    @Data
    public static class AdminDto {
        private String id;
        private String administeredAt;
        private String administeredById;
        private String administeredByName;
        private String status;
        private String doseGiven;
        private String reason;
        private String notes;
        private String createdAt;
    }

    @Data
    public static class OrderCardDto {
        private String         orderId;
        private String         drugName;
        private String         drugStrength;
        private String         drugForm;
        private String         dose;
        private String         frequency;
        private String         route;
        private String         instructions;
        private String         prescribedAt;
        private String         prescribedBy;
        /** ACTIVE or STOPPED */
        private String         status;
        private String         stoppedAt;
        private String         stoppedByName;
        private String         stopReason;
        /** Set when the prescriber overrode a recorded drug allergy for this item. */
        private String         allergyOverrideReason;
        /** Total prescribed quantity — what pharmacy was asked to dispense. */
        private Integer        quantity;
        /** Units pharmacy has actually issued so far. */
        private Integer        dispensedQty;
        /**
         * Units returned from ward — total optimistic hold. Includes both
         * pending (awaiting pharmacy verification) and pharmacy-verified.
         * Returnable = dispensedQty − returnedQty.
         */
        private Integer        returnedQty;
        /**
         * Subset of {@code returnedQty} that's still in the REQUESTED state
         * (nurse-initiated, not yet verified by pharmacy). The MAR card
         * surfaces a "pending verify" chip when this is &gt; 0 so the nurse
         * sees the audit chain status without phoning pharmacy. Derived
         * field: {@code confirmedReturnQty = returnedQty − pendingReturnQty}.
         */
        private Integer        pendingReturnQty;
        /** PENDING | PARTIAL | DISPENSED — recomputed after every dispense/return event. */
        private String         dispenseStatus;
        /** Set on a NEW order created via the ward-return drug-switch flow — the id of the order it replaces. */
        private String         replacesPrescriptionItemId;
        /** Display name of the drug this order replaces. Pulled in one batch query in the controller. */
        private String         replacesDrugName;
        /** Set on an OLD order that has been replaced — the id of the new order that succeeded it. */
        private String         replacedByPrescriptionItemId;
        /** Display name of the new drug that replaced this one. */
        private String         replacedByDrugName;
        private List<AdminDto> administrations;
    }
}
