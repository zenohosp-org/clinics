package com.zenlocare.clinics.service;

import com.zenlocare.clinics.controller.RecordController.PrescriptionItemRequest;
import com.zenlocare.clinics.dto.PrescriptionReturnDtos.*;
import com.zenlocare.clinics.entity.HistoryType;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.PatientRecord;
import com.zenlocare.clinics.entity.PrescriptionDispenseStatus;
import com.zenlocare.clinics.entity.PrescriptionItem;
import com.zenlocare.clinics.entity.PrescriptionReturnRequest;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.AdmissionRepository;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.PrescriptionItemRepository;
import com.zenlocare.clinics.repository.PrescriptionReturnRequestRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Owns the lifecycle of a ward-return: nurse-initiate → pharmacy-verify or
 * pharmacy-reject. Mirrors the existing dispense flow so the pharmacy
 * integration is symmetric: HMS exposes pending requests, pharmacy calls back
 * with the result.
 *
 * Concurrency: {@link PrescriptionItem} carries an {@code @Version} column —
 * dispense, MAR, stop, and return mutations all bump it, so simultaneous
 * writers see a stale version and Hibernate throws OptimisticLockException
 * (the caller must retry).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class PrescriptionReturnService {

    /**
     * Reasons that route the physical units to QUARANTINE (audit only — pharmacy
     * does not credit sellable stock). Authoritative copy lives here so HMS
     * can pre-flight the put-to decision on the pending DTO; pharmacy may
     * override at verify time.
     */
    private static final Set<String> QUARANTINE_REASONS = Set.of(
            "INEFFECTIVE", "ADVERSE_REACTION",
            "EXPIRY_NEAR",
            "WASTAGE_BROKEN", "WASTAGE_SPILLED");

    /**
     * Caller roles permitted to attach a {@code replacement} block to a return.
     * Mirrors the {@code @PreAuthorize} on {@code POST /api/records} — switching
     * drugs is a prescribing action, and nurses can't prescribe (they can still
     * do plain returns without a replacement).
     */
    private static final Set<String> CAN_PRESCRIBE_ROLES = Set.of(
            "doctor", "hospital_admin", "super_admin");

    private final PrescriptionItemRepository prescriptionItemRepo;
    private final PrescriptionReturnRequestRepository returnRequestRepo;
    private final AdmissionRepository admissionRepo;
    private final UserRepository userRepo;
    private final HospitalRepository hospitalRepo;
    private final RecordService recordService;

    // ─── Nurse initiate ────────────────────────────────────────────────────────

    public InitiateResponse initiate(UUID prescriptionItemId,
                                     InitiateRequest req,
                                     User principal) {
        if (req == null) throw new BadRequestException("Request body is required");
        if (req.getReturnQty() == null || req.getReturnQty() <= 0)
            throw new BadRequestException("returnQty must be > 0");
        if (req.getReasonCode() == null || req.getReasonCode().isBlank())
            throw new BadRequestException("reasonCode is required");
        if ("OTHER".equalsIgnoreCase(req.getReasonCode())
                && (req.getReasonNotes() == null || req.getReasonNotes().isBlank()))
            throw new BadRequestException("reasonNotes is required when reasonCode = OTHER");
        if (req.getClientRequestId() == null)
            throw new BadRequestException("clientRequestId is required for idempotency");
        if (req.isStopOrder()
                && (req.getStopReason() == null || req.getStopReason().isBlank()))
            throw new BadRequestException("stopReason is required when stopOrder = true");

        // Idempotency short-circuit — replay returns the original row unchanged.
        // Don't re-create the replacement drug on a replay; the original transaction
        // already produced it, and the new prescriptionItemId is discoverable
        // through the existing chain (prescription_items.replaces_prescription_item_id).
        var existing = returnRequestRepo.findByClientRequestId(req.getClientRequestId());
        if (existing.isPresent()) return toInitiateResponse(existing.get(), null);

        var item = prescriptionItemRepo.findById(Objects.requireNonNull(prescriptionItemId))
                .orElseThrow(() -> new ResourceNotFoundException("Prescription order not found"));

        UUID admissionId = item.getRecord().getAdmissionId();
        if (admissionId == null)
            throw new BadRequestException("Return is only supported for IPD prescriptions");

        var admission = admissionRepo.findById(admissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Admission not found"));

        var caller = userRepo.findById(Objects.requireNonNull(principal.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UUID admHospitalId    = admission.getHospital() != null ? admission.getHospital().getId() : null;
        UUID callerHospitalId = caller.getHospital()    != null ? caller.getHospital().getId()    : null;
        if (callerHospitalId == null || !callerHospitalId.equals(admHospitalId))
            throw new UnauthorizedException("Admission does not belong to your hospital");

        int dispensed = nz(item.getDispensedQty());
        int alreadyHeld = nz(returnRequestRepo.sumHeldOrVerifiedQty(item.getId()));
        int remaining = Math.max(0, dispensed - alreadyHeld);

        if (req.getReturnQty() > remaining) {
            throw new BadRequestException(
                    "returnQty exceeds returnable units (returnable=" + remaining
                    + ", dispensed=" + dispensed + ", alreadyHeldOrReturned=" + alreadyHeld + ")");
        }

        // Stop the order in the same transaction if asked. Idempotent — if it's
        // already STOPPED we leave the original stoppedAt/stopReason intact so
        // the medico-legal audit shows the first stop event, not this one.
        if (req.isStopOrder() && !"STOPPED".equals(item.getStatus())) {
            item.setStatus("STOPPED");
            item.setStoppedAt(LocalDateTime.now());
            item.setStoppedBy(caller);
            item.setStopReason(req.getStopReason().trim());
        }

        // Optimistic hold: increment returned_qty up front so the nurse sees an
        // accurate remaining count immediately and concurrent return requests
        // can't double-spend the same units. Pharmacy verify is a no-op for the
        // counter (it's already incremented); reject decrements back.
        item.setReturnedQty(nz(item.getReturnedQty()) + req.getReturnQty());
        item.setDispenseStatus(recomputeDispenseStatus(item));
        prescriptionItemRepo.save(item);

        Hospital hospital = item.getRecord().getHospital() != null
                ? item.getRecord().getHospital()
                : hospitalRepo.findById(admHospitalId)
                        .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));

        // Optional batch tag — nurses scan/type from the strip label.
        // Normalised to upper-case + trimmed so pharmacy's case-insensitive
        // resolve doesn't get tripped up by stray spaces or lowercase entry.
        String batchCode = req.getBatchNumber();
        if (batchCode != null) {
            batchCode = batchCode.trim();
            if (batchCode.isEmpty()) batchCode = null;
            else batchCode = batchCode.toUpperCase();
        }

        var request = PrescriptionReturnRequest.builder()
                .hospital(hospital)
                .prescriptionItem(item)
                .admissionId(admissionId)
                .initiatedByUser(caller)
                .returnQty(req.getReturnQty())
                .reasonCode(req.getReasonCode().trim().toUpperCase())
                .reasonNotes(req.getReasonNotes())
                .batchNumber(batchCode)
                .status("REQUESTED")
                .clientRequestId(req.getClientRequestId())
                .build();
        request = returnRequestRepo.save(request);

        // ── Optional: switch drug ──────────────────────────────────────────────
        // When the caller supplies a replacement block, hand it to RecordService
        // so the new prescription_items row goes through the SAME validation as
        // a direct doctor prescription (qty > 0, valid frequency/route codes,
        // MRN allocation, attendingDoctor resolution). Doing it here, in the
        // same outer transaction as the stop/return, keeps the audit invariant
        // "if the old order is STOPPED, the new order exists" — a partial
        // failure would roll the whole thing back.
        PrescriptionItem replacementItem = null;
        if (req.getReplacement() != null) {
            replacementItem = createReplacement(item, req, caller, hospital);
        }

        return toInitiateResponse(request, replacementItem);
    }

    /**
     * Stops-old / spawns-new helper. Re-uses {@link RecordService#createRecord}
     * so the new prescription is indistinguishable from one a doctor would have
     * created directly — same MRN scheme, same enum validation, same eager-role
     * proxy handling. The new record's description carries the human-readable
     * "Switched from X to Y" string the IPD log timeline renders without any
     * special-case rendering.
     */
    private PrescriptionItem createReplacement(PrescriptionItem oldItem,
                                               InitiateRequest req,
                                               User caller,
                                               Hospital hospital) {
        // Role gate — switching is prescribing. Nurses get a clean 403.
        String roleName = caller.getRole() != null ? caller.getRole().getName() : null;
        if (roleName == null || !CAN_PRESCRIBE_ROLES.contains(roleName.toLowerCase())) {
            throw new UnauthorizedException(
                    "Switching to a replacement drug requires a doctor or admin role");
        }

        ReplacementDrug rep = req.getReplacement();
        if (rep.getDrugName() == null || rep.getDrugName().isBlank())
            throw new BadRequestException("replacement.drugName is required");
        if (rep.getQuantity() == null || rep.getQuantity() <= 0)
            throw new BadRequestException("replacement.quantity must be > 0");

        // Translate the DTO into the shape RecordService expects. Keeping this
        // mapping local (instead of having callers build a PrescriptionItemRequest
        // directly) means we own the contract — future fields land here once.
        PrescriptionItemRequest pir = new PrescriptionItemRequest();
        pir.setDrugId(rep.getDrugId());
        pir.setDrugName(rep.getDrugName());
        pir.setDrugGeneric(rep.getDrugGeneric());
        pir.setDrugStrength(rep.getDrugStrength());
        pir.setDrugForm(rep.getDrugForm());
        pir.setDose(rep.getDose());
        pir.setFrequency(rep.getFrequency());
        pir.setDurationDays(rep.getDurationDays());
        pir.setQuantity(rep.getQuantity());
        pir.setRoute(rep.getRoute());
        pir.setInstructions(rep.getInstructions());
        pir.setDisplayOrder(0);
        pir.setAllergyOverrideReason(rep.getAllergyOverrideReason());
        pir.setReplacesPrescriptionItemId(oldItem.getId());

        // Build the "Switched from X to Y: <reason>" line the IPD log timeline
        // will surface verbatim. Keep it terse — full audit lives in the
        // prescription_return_requests row.
        String description = buildSwitchDescription(oldItem, rep, req);

        // Re-fetch the patient id off the OLD record — the new record sits on
        // the same admission, same patient, same hospital.
        Integer patientId = oldItem.getRecord().getPatient().getId();
        UUID admissionId  = oldItem.getRecord().getAdmissionId();

        // Caller is the doctor of record — they're the one ordering the switch.
        // Staff entering on behalf of someone else is handled by the existing
        // direct prescription create flow; the ward-return path is "the person
        // pressing the button is the prescriber".
        PatientRecord newRecord = recordService.createRecord(
                hospital.getId(), patientId, caller,
                HistoryType.PRESCRIPTION.name(),
                description,
                /* instructions */ null,
                /* nextVisitDate */ null,
                admissionId,
                oldItem.getRecord().getAdmissionNumber(),
                /* appointmentId */ null,
                java.util.List.of(pir),
                caller.getId(),
                null, null, null, null);

        // createRecord cascades item save through the record — pull the first
        // (and only) one back out by matching the soft FK we just set.
        return newRecord.getPrescriptionItems().stream()
                .filter(pi -> oldItem.getId().equals(pi.getReplacesPrescriptionItemId()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Replacement prescription was created but could not be re-read; this is a bug"));
    }

    private static String buildSwitchDescription(PrescriptionItem oldItem,
                                                 ReplacementDrug rep,
                                                 InitiateRequest req) {
        String oldLabel = joinDrugLabel(oldItem.getDrugName(), oldItem.getDrugStrength());
        String newLabel = joinDrugLabel(rep.getDrugName(),    rep.getDrugStrength());
        String tail     = (req.getReasonNotes() != null && !req.getReasonNotes().isBlank())
                ? " — " + req.getReasonNotes().trim()
                : (req.getStopReason() != null && !req.getStopReason().isBlank())
                    ? " — " + req.getStopReason().trim()
                    : "";
        return "Switched from " + oldLabel + " to " + newLabel + tail;
    }

    private static String joinDrugLabel(String name, String strength) {
        if (name == null) return "(unknown)";
        if (strength == null || strength.isBlank()) return name.trim();
        return name.trim() + " " + strength.trim();
    }

    // ─── Pharmacy poll ─────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PendingReturnRequestDto> listPending(UUID hospitalId) {
        List<PrescriptionReturnRequest> rows = returnRequestRepo.findPendingForHospital(hospitalId);
        List<PendingReturnRequestDto> out = new ArrayList<>(rows.size());
        for (var prr : rows) {
            var item = prr.getPrescriptionItem();
            var patient = item.getRecord().getPatient();
            var initiator = prr.getInitiatedByUser();
            out.add(PendingReturnRequestDto.builder()
                    .returnRequestId(prr.getId())
                    .prescriptionItemId(item.getId())
                    .admissionId(prr.getAdmissionId())
                    .patientId(patient != null ? patient.getId() : null)
                    .patientName(patient != null ? joinName(patient.getFirstName(), patient.getLastName()) : null)
                    .drugName(item.getDrugName())
                    .drugStrength(item.getDrugStrength())
                    .drugForm(item.getDrugForm())
                    .dose(item.getDose())
                    .returnQty(prr.getReturnQty())
                    .reasonCode(prr.getReasonCode())
                    .reasonNotes(prr.getReasonNotes())
                    .batchNumber(prr.getBatchNumber())
                    .initiatedAt(prr.getCreatedAt())
                    .initiatedByName(initiator != null ? joinName(initiator.getFirstName(), initiator.getLastName()) : null)
                    .initiatedByRole(initiator != null && initiator.getRole() != null ? initiator.getRole().getName() : null)
                    .originalDispensedQty(item.getDispensedQty())
                    .build());
        }
        return out;
    }

    // ─── Pharmacy verify callback ──────────────────────────────────────────────

    public CallbackResultDto confirm(ConfirmRequest req) {
        if (req == null || req.getReturnRequestId() == null)
            throw new BadRequestException("returnRequestId is required");

        var request = returnRequestRepo.findById(req.getReturnRequestId())
                .orElseThrow(() -> new ResourceNotFoundException("Return request not found"));

        if ("VERIFIED".equals(request.getStatus())) {
            // Idempotent confirm — return the existing state, do not double-bump anything.
            return toCallbackResult(request);
        }
        if (!"REQUESTED".equals(request.getStatus()))
            throw new BadRequestException("Return request is not in REQUESTED state (current: " + request.getStatus() + ")");

        // Sanity-check the reported qty matches what was requested. Pharmacy is
        // expected to confirm exactly what the nurse asked to return; any deviation
        // is a workflow bug worth surfacing rather than silently absorbing.
        int reported = 0;
        if (req.getLines() != null) {
            for (var line : req.getLines()) {
                if (line.getPrescriptionItemId() == null || line.getQty() == null) continue;
                if (!line.getPrescriptionItemId().equals(request.getPrescriptionItem().getId()))
                    throw new BadRequestException(
                            "Confirm line references prescriptionItemId other than the request's item");
                reported += line.getQty();
            }
        }
        if (reported != request.getReturnQty())
            throw new BadRequestException(
                    "Confirmed qty (" + reported + ") does not match requested qty (" + request.getReturnQty() + ")");

        // returned_qty was already bumped optimistically at initiate — verify is a
        // status transition only. dispense_status was also recomputed there.
        request.setStatus("VERIFIED");
        request.setVerifiedAt(LocalDateTime.now());
        returnRequestRepo.save(request);

        return toCallbackResult(request);
    }

    // ─── Pharmacy reject callback ──────────────────────────────────────────────

    public CallbackResultDto reject(RejectRequest req) {
        if (req == null || req.getReturnRequestId() == null)
            throw new BadRequestException("returnRequestId is required");
        if (req.getReason() == null || req.getReason().isBlank())
            throw new BadRequestException("reason is required");

        var request = returnRequestRepo.findById(req.getReturnRequestId())
                .orElseThrow(() -> new ResourceNotFoundException("Return request not found"));

        if ("REJECTED".equals(request.getStatus())) return toCallbackResult(request);
        if (!"REQUESTED".equals(request.getStatus()))
            throw new BadRequestException(
                    "Return request is not in REQUESTED state (current: " + request.getStatus() + ")");

        // Reverse the optimistic hold on the prescription item.
        var item = request.getPrescriptionItem();
        item.setReturnedQty(Math.max(0, nz(item.getReturnedQty()) - request.getReturnQty()));
        item.setDispenseStatus(recomputeDispenseStatus(item));
        prescriptionItemRepo.save(item);

        request.setStatus("REJECTED");
        request.setRejectedReason(req.getReason().trim());
        returnRequestRepo.save(request);

        return toCallbackResult(request);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Recompute the coarse {@code dispense_status} after a mutation on
     * {@code dispensed_qty} or {@code returned_qty}. Backward transition
     * (DISPENSED → PARTIAL after a return) is intentional — the queue must
     * not show a partly-returned drug as fully dispensed.
     */
    public static PrescriptionDispenseStatus recomputeDispenseStatus(PrescriptionItem item) {
        int prescribed = item.getQuantity() != null ? item.getQuantity() : 0;
        int effective  = item.getEffectiveDispensedQty();
        if (effective <= 0)               return PrescriptionDispenseStatus.PENDING;
        if (effective >= prescribed)      return PrescriptionDispenseStatus.DISPENSED;
        return PrescriptionDispenseStatus.PARTIALLY_DISPENSED;
    }

    /** Convenience: is this reason routed to quarantine? Exposed for the pharmacy DTO. */
    public static boolean isQuarantineReason(String reasonCode) {
        return reasonCode != null && QUARANTINE_REASONS.contains(reasonCode.toUpperCase());
    }

    private InitiateResponse toInitiateResponse(PrescriptionReturnRequest request,
                                                PrescriptionItem replacementItem) {
        var item = request.getPrescriptionItem();
        int dispensed = nz(item.getDispensedQty());
        int alreadyHeld = nz(returnRequestRepo.sumHeldOrVerifiedQty(item.getId()));
        int remaining = Math.max(0, dispensed - alreadyHeld);
        return InitiateResponse.builder()
                .returnRequestId(request.getId())
                .prescriptionItemId(item.getId())
                .prescriptionStatus(item.getStatus())
                .dispenseStatus(item.getDispenseStatus() != null ? item.getDispenseStatus().name() : null)
                .dispensedQty(dispensed)
                .returnedQty(nz(item.getReturnedQty()))
                .remainingReturnable(remaining)
                .requestStatus(request.getStatus())
                .replacementPrescriptionItemId(replacementItem != null ? replacementItem.getId() : null)
                .replacementDrugName(replacementItem != null ? replacementItem.getDrugName() : null)
                .build();
    }

    private CallbackResultDto toCallbackResult(PrescriptionReturnRequest request) {
        var item = request.getPrescriptionItem();
        return CallbackResultDto.builder()
                .returnRequestId(request.getId())
                .status(request.getStatus())
                .prescriptionItemId(item.getId())
                .returnedQty(nz(item.getReturnedQty()))
                .dispenseStatus(item.getDispenseStatus() != null ? item.getDispenseStatus().name() : null)
                .build();
    }

    private static int nz(Integer n) { return n == null ? 0 : n; }

    private static String joinName(String first, String last) {
        String f = first == null ? "" : first.trim();
        String l = last  == null ? "" : last.trim();
        return (f + " " + l).trim();
    }
}
