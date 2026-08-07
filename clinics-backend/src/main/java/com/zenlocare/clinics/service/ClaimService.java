package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.ClaimDtos.ClaimEventResponse;
import com.zenlocare.clinics.dto.ClaimDtos.ClaimResponse;
import com.zenlocare.clinics.dto.ClaimDtos.ClaimsSummary;
import com.zenlocare.clinics.dto.ClaimDtos.CreateClaimRequest;
import com.zenlocare.clinics.dto.ClaimDtos.DeductionLineRequest;
import com.zenlocare.clinics.dto.ClaimDtos.DeductionLineResponse;
import com.zenlocare.clinics.dto.ClaimDtos.PayerRequest;
import com.zenlocare.clinics.dto.ClaimDtos.TransitionRequest;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.entity.ClaimDeductionLine;
import com.zenlocare.clinics.entity.ClaimEvent;
import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.entity.InvoiceClaim;
import com.zenlocare.clinics.entity.Payer;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.ClaimDeductionLineRepository;
import com.zenlocare.clinics.repository.ClaimEventRepository;
import com.zenlocare.clinics.repository.InvoiceClaimRepository;
import com.zenlocare.clinics.repository.InvoiceRepository;
import com.zenlocare.clinics.repository.PayerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Insurance/TPA claims lifecycle. All transitions are validated here — the
 * status field is never set free-form — and every read/write is scoped to the
 * caller's hospital. Claims are append-and-update: never deleted, so the audit
 * trail of what was claimed, approved, denied and settled always survives.
 */
@Service
@RequiredArgsConstructor
public class ClaimService {

    private static final Set<String> PAYER_TYPES = Set.of("TPA", "INSURER", "CORPORATE", "GOVT_SCHEME");
    private static final Set<String> APPROVED_STATES = Set.of("APPROVED", "PARTIALLY_APPROVED");
    /** States a SUBMIT may start from: fresh, pre-authorized, or denied (rework/resubmission). */
    private static final Set<String> SUBMITTABLE = Set.of("DRAFT", "PRE_AUTH", "DENIED");
    /** A payer may decide (approve/deny) a claim that is submitted or was queried then answered. */
    private static final Set<String> DECIDABLE = Set.of("SUBMITTED", "QUERIED");
    /** How a payer deduction (approved − settled) may be dispositioned. */
    private static final Set<String> DISPOSITIONS = Set.of("WRITE_OFF", "APPEAL", "RECOVER_FROM_PATIENT");

    private final PayerRepository payerRepository;
    private final InvoiceClaimRepository claimRepository;
    private final ClaimEventRepository claimEventRepository;
    private final ClaimDeductionLineRepository deductionLineRepository;
    private final InvoiceRepository invoiceRepository;
    private final InvoiceService invoiceService;

    // ── Payers ──

    @Transactional(readOnly = true)
    public List<Payer> listPayers(UUID hospitalId, boolean includeInactive) {
        return includeInactive
                ? payerRepository.findByHospitalIdOrderByNameAsc(hospitalId)
                : payerRepository.findByHospitalIdAndIsActiveTrueOrderByNameAsc(hospitalId);
    }

    @Transactional
    public Payer createPayer(UUID hospitalId, PayerRequest req) {
        String name = required(req.getName(), "Payer name is required");
        String type = required(req.getType(), "Payer type is required").toUpperCase();
        if (!PAYER_TYPES.contains(type)) {
            throw new BadRequestException("Payer type must be one of " + PAYER_TYPES);
        }
        if (payerRepository.existsByHospitalIdAndNameIgnoreCase(hospitalId, name)) {
            throw new BadRequestException("A payer with this name already exists");
        }
        return payerRepository.save(Payer.builder()
                .hospitalId(hospitalId)
                .name(name)
                .type(type)
                .contactPerson(trimToNull(req.getContactPerson()))
                .phone(trimToNull(req.getPhone()))
                .email(trimToNull(req.getEmail()))
                .address(trimToNull(req.getAddress()))
                .isActive(req.getIsActive() == null || req.getIsActive())
                .build());
    }

    @Transactional
    public Payer updatePayer(UUID hospitalId, UUID payerId, PayerRequest req) {
        Payer payer = payerRepository.findByIdAndHospitalId(payerId, hospitalId)
                .orElseThrow(() -> new BadRequestException("Payer not found"));
        if (req.getName() != null && !req.getName().isBlank()
                && !payer.getName().equalsIgnoreCase(req.getName().trim())
                && payerRepository.existsByHospitalIdAndNameIgnoreCase(hospitalId, req.getName().trim())) {
            throw new BadRequestException("A payer with this name already exists");
        }
        if (req.getName() != null && !req.getName().isBlank()) payer.setName(req.getName().trim());
        if (req.getType() != null && !req.getType().isBlank()) {
            String type = req.getType().toUpperCase();
            if (!PAYER_TYPES.contains(type)) {
                throw new BadRequestException("Payer type must be one of " + PAYER_TYPES);
            }
            payer.setType(type);
        }
        if (req.getContactPerson() != null) payer.setContactPerson(trimToNull(req.getContactPerson()));
        if (req.getPhone() != null) payer.setPhone(trimToNull(req.getPhone()));
        if (req.getEmail() != null) payer.setEmail(trimToNull(req.getEmail()));
        if (req.getAddress() != null) payer.setAddress(trimToNull(req.getAddress()));
        if (req.getIsActive() != null) payer.setIsActive(req.getIsActive());
        return payerRepository.save(payer);
    }

    // ── Claims ──

    @Transactional
    public InvoiceClaim createClaim(UUID hospitalId, CreateClaimRequest req, User principal) {
        if (req.getInvoiceId() == null) throw new BadRequestException("invoiceId is required");
        if (req.getPayerId() == null) throw new BadRequestException("payerId is required");

        Invoice invoice = invoiceRepository.findById(req.getInvoiceId())
                .orElseThrow(() -> new BadRequestException("Invoice not found"));
        UUID invoiceHospital = invoice.getHospital() != null ? invoice.getHospital().getId() : null;
        if (!hospitalId.equals(invoiceHospital)) {
            throw new BadRequestException("Invoice does not belong to this hospital");
        }
        Payer payer = payerRepository.findByIdAndHospitalId(req.getPayerId(), hospitalId)
                .orElseThrow(() -> new BadRequestException("Payer not found"));
        if (Boolean.FALSE.equals(payer.getIsActive())) {
            throw new BadRequestException("Payer is inactive");
        }

        BigDecimal claimed = req.getClaimedAmount();
        if (claimed == null || claimed.signum() <= 0) {
            throw new BadRequestException("claimedAmount must be greater than zero");
        }
        if (invoice.getTotal() != null && claimed.compareTo(invoice.getTotal()) > 0) {
            throw new BadRequestException("claimedAmount cannot exceed the invoice total ("
                    + invoice.getTotal() + ")");
        }
        if (claimRepository.countOpenByInvoice(invoice.getId(), hospitalId) > 0) {
            throw new BadRequestException(
                    "This invoice already has a claim in progress. Settle or deny it before raising another.");
        }

        InvoiceClaim claim = InvoiceClaim.builder()
                .hospitalId(hospitalId)
                .invoiceId(invoice.getId())
                .payerId(payer.getId())
                .status("DRAFT")
                .pendingWith(pendingWithFor("DRAFT"))   // HOSPITAL
                .pendingSince(LocalDateTime.now())
                .claimedAmount(claimed.setScale(2, java.math.RoundingMode.HALF_UP))
                .preAuthNo(trimToNull(req.getPreAuthNo()))
                // notes column is legacy/read-only — the create note goes in as an event below.
                .createdBy(principal != null ? principal.getId() : null)
                .createdByName(principal != null ? principal.getEmail() : null)
                .build();
        claim = claimRepository.save(claim);

        recordEvent(claim, "STATUS_CHANGE", "(new) → DRAFT", null, principal);
        String note = trimToNull(req.getNotes());
        if (note != null) {
            recordEvent(claim, "NOTE", note, null, principal);
        }
        return claim;
    }

    /**
     * Applies one lifecycle action with strict from-state validation:
     *   PRE_AUTH: DRAFT → PRE_AUTH (requires preAuthNo)
     *   SUBMIT:   DRAFT/PRE_AUTH/DENIED → SUBMITTED
     *   QUERY:    SUBMITTED → QUERIED (payer kicked it back; requires notes = query text)
     *   RESPOND:  QUERIED → SUBMITTED (we resupplied; notes = our response)
     *   APPROVE:  SUBMITTED/QUERIED → APPROVED or PARTIALLY_APPROVED (by amount)
     *   DENY:     SUBMITTED/QUERIED → DENIED (requires denialReason)
     *   REQUEST_ENHANCEMENT: APPROVED/PARTIALLY_APPROVED → ENHANCEMENT_REQUESTED
     *                        (requestedAmount, > current approved, ≤ claimed)
     *   APPROVE_ENHANCEMENT: ENHANCEMENT_REQUESTED → APPROVED/PARTIALLY_APPROVED
     *                        (approvedAmount raised to the granted figure)
     *   DENY_ENHANCEMENT:    ENHANCEMENT_REQUESTED → prior approved state
     *                        (approved_amount unchanged; requires denialReason)
     *   SETTLE:   APPROVED/PARTIALLY_APPROVED → SETTLED  (NOT from ENHANCEMENT_REQUESTED)
     *
     * Every action, in this one transaction, also: derives pending_with from the
     * resulting status, resets pending_since on entering a non-NONE pending state,
     * and appends a STATUS_CHANGE event (plus a QUERY_RAISED/QUERY_RESPONDED/NOTE
     * event where relevant). No REQUIRES_NEW — a rolled-back transition takes its
     * events with it.
     */
    @Transactional
    public InvoiceClaim transition(UUID hospitalId, UUID claimId, TransitionRequest req, User principal) {
        InvoiceClaim claim = claimRepository.findByIdAndHospitalId(claimId, hospitalId)
                .orElseThrow(() -> new BadRequestException("Claim not found"));
        String action = required(req.getAction(), "action is required").toUpperCase();
        String from = claim.getStatus();

        // NOTE_DEDUCTION is not a lifecycle move — the claim stays SETTLED — so it
        // takes its own path (no status change, no STATUS_CHANGE event, and it must
        // never touch the invoice). Handled fully here and returned.
        if ("NOTE_DEDUCTION".equals(action)) {
            return noteDeduction(claim, req, principal);
        }

        // Did this action already consume req.notes as its own event body? If so we
        // must not also write it as a generic NOTE below.
        boolean notesConsumed = false;

        switch (action) {
            case "PRE_AUTH" -> {
                requireState(from, Set.of("DRAFT"), action);
                claim.setPreAuthNo(required(req.getPreAuthNo(), "preAuthNo is required for pre-authorization"));
                claim.setStatus("PRE_AUTH");
            }
            case "SUBMIT" -> {
                requireState(from, SUBMITTABLE, action);
                if (req.getTpaClaimNo() != null && !req.getTpaClaimNo().isBlank()) {
                    claim.setTpaClaimNo(req.getTpaClaimNo().trim());
                }
                // A resubmission wipes the previous decision so stale amounts can't leak through.
                claim.setApprovedAmount(null);
                claim.setDenialReason(null);
                claim.setDecidedAt(null);
                claim.setStatus("SUBMITTED");
                claim.setSubmittedAt(LocalDateTime.now());
            }
            case "QUERY" -> {
                requireState(from, Set.of("SUBMITTED"), action);
                String queryText = required(req.getNotes(), "notes (the payer's query) is required to raise a query");
                claim.setStatus("QUERIED");
                recordEvent(claim, "QUERY_RAISED", queryText, req.getDueDate(), principal);
                notesConsumed = true;
            }
            case "RESPOND" -> {
                requireState(from, Set.of("QUERIED"), action);
                // Answering a query puts the ball back with the payer — back to SUBMITTED.
                claim.setStatus("SUBMITTED");
                claim.setSubmittedAt(LocalDateTime.now());
                String response = trimToNull(req.getNotes());
                recordEvent(claim, "QUERY_RESPONDED",
                        response != null ? response : "(responded)", null, principal);
                notesConsumed = true;
            }
            case "APPROVE" -> {
                requireState(from, DECIDABLE, action);
                BigDecimal approved = req.getApprovedAmount();
                if (approved == null || approved.signum() <= 0) {
                    throw new BadRequestException("approvedAmount must be greater than zero");
                }
                if (approved.compareTo(claim.getClaimedAmount()) > 0) {
                    throw new BadRequestException("approvedAmount cannot exceed the claimed amount ("
                            + claim.getClaimedAmount() + ")");
                }
                approved = approved.setScale(2, java.math.RoundingMode.HALF_UP);
                claim.setApprovedAmount(approved);
                claim.setStatus(approved.compareTo(claim.getClaimedAmount()) < 0
                        ? "PARTIALLY_APPROVED" : "APPROVED");
                claim.setDecidedAt(LocalDateTime.now());
            }
            case "DENY" -> {
                requireState(from, DECIDABLE, action);
                claim.setDenialReason(required(req.getDenialReason(), "denialReason is required"));
                claim.setStatus("DENIED");
                claim.setDecidedAt(LocalDateTime.now());
            }
            case "REQUEST_ENHANCEMENT" -> {
                // Mid-stay the bill outgrows the approval; the desk asks the TPA to
                // raise it. This is NOT a settle and touches no patient money — it only
                // moves the claim into a payer-pending state carrying the asked figure.
                requireState(from, APPROVED_STATES, action);
                BigDecimal requested = req.getRequestedAmount();
                if (requested == null || requested.signum() <= 0) {
                    throw new BadRequestException("requestedAmount must be greater than zero");
                }
                requested = requested.setScale(2, java.math.RoundingMode.HALF_UP);
                BigDecimal priorApproved = nz(claim.getApprovedAmount());
                if (requested.compareTo(priorApproved) <= 0) {
                    throw new BadRequestException("requestedAmount must exceed the current approved amount ("
                            + priorApproved + ")");
                }
                if (requested.compareTo(claim.getClaimedAmount()) > 0) {
                    throw new BadRequestException("requestedAmount cannot exceed the claimed amount ("
                            + claim.getClaimedAmount() + ")");
                }
                claim.setRequestedAmount(requested);
                claim.setStatus("ENHANCEMENT_REQUESTED");
                recordEvent(claim, "ENHANCEMENT_REQUESTED",
                        "Enhancement requested: raise approved " + priorApproved + " → " + requested, null, principal);
                notesConsumed = false; // any extra note still appends as NOTE below
            }
            case "APPROVE_ENHANCEMENT" -> {
                requireState(from, Set.of("ENHANCEMENT_REQUESTED"), action);
                BigDecimal priorApproved = nz(claim.getApprovedAmount());
                BigDecimal granted = req.getApprovedAmount();
                if (granted == null || granted.signum() <= 0) {
                    throw new BadRequestException("approvedAmount (the granted figure) must be greater than zero");
                }
                granted = granted.setScale(2, java.math.RoundingMode.HALF_UP);
                if (granted.compareTo(priorApproved) <= 0) {
                    throw new BadRequestException("granted amount must exceed the prior approved amount ("
                            + priorApproved + ")");
                }
                if (granted.compareTo(claim.getClaimedAmount()) > 0) {
                    throw new BadRequestException("granted amount cannot exceed the claimed amount ("
                            + claim.getClaimedAmount() + ")");
                }
                claim.setApprovedAmount(granted);
                claim.setRequestedAmount(null);
                // Recompute APPROVED vs PARTIALLY_APPROVED off the raised amount — same rule as APPROVE.
                claim.setStatus(granted.compareTo(claim.getClaimedAmount()) < 0
                        ? "PARTIALLY_APPROVED" : "APPROVED");
                claim.setDecidedAt(LocalDateTime.now());
                recordEvent(claim, "ENHANCEMENT_APPROVED",
                        "Enhancement approved: raised approved " + priorApproved + " → " + granted, null, principal);
            }
            case "DENY_ENHANCEMENT" -> {
                requireState(from, Set.of("ENHANCEMENT_REQUESTED"), action);
                String reason = required(req.getDenialReason(), "denialReason is required");
                BigDecimal requested = claim.getRequestedAmount();
                BigDecimal approved = nz(claim.getApprovedAmount());
                // approved_amount is left EXACTLY as it was; the claim returns to the
                // prior approved state, reconstructed deterministically from the amounts.
                claim.setRequestedAmount(null);
                claim.setStatus(approved.compareTo(claim.getClaimedAmount()) < 0
                        ? "PARTIALLY_APPROVED" : "APPROVED");
                recordEvent(claim, "ENHANCEMENT_DENIED",
                        "Enhancement to " + requested + " denied (approved stays " + approved + "): " + reason,
                        null, principal);
            }
            case "SETTLE" -> {
                // NOTE: APPROVED_STATES deliberately excludes ENHANCEMENT_REQUESTED, so a
                // claim with an enhancement in flight cannot be settled until it is
                // approved or denied. Enforced by requireState below.
                requireState(from, APPROVED_STATES, action);
                BigDecimal settled = req.getSettledAmount() != null
                        ? req.getSettledAmount() : claim.getApprovedAmount();
                if (settled == null || settled.signum() <= 0) {
                    throw new BadRequestException("settledAmount must be greater than zero");
                }
                if (settled.compareTo(claim.getApprovedAmount()) > 0) {
                    throw new BadRequestException("settledAmount cannot exceed the approved amount ("
                            + claim.getApprovedAmount() + ")");
                }
                settled = settled.setScale(2, java.math.RoundingMode.HALF_UP);

                // Record the payer's money as an Insurance payment on the invoice —
                // atomically with the status change, so a settled claim can never
                // leave the invoice looking unpaid in receivables. Skippable
                // (recordPayment=false) when the payment was already entered
                // manually, so it isn't double-counted.
                if (!Boolean.FALSE.equals(req.getRecordPayment())) {
                    Invoice invoice = invoiceRepository.findById(claim.getInvoiceId())
                            .orElseThrow(() -> new BadRequestException("Invoice not found for this claim"));
                    BigDecimal outstanding = nz(invoice.getTotal())
                            .subtract(nz(invoice.getPaidAmount()))
                            .subtract(nz(invoice.getAdvanceAdjusted()));
                    if (settled.compareTo(outstanding) > 0) {
                        throw new BadRequestException("Settled amount " + settled
                                + " exceeds the invoice's outstanding balance " + outstanding
                                + ". If this payment was already recorded on the invoice, settle with recordPayment=false.");
                    }
                    Payer payer = payerRepository.findByIdAndHospitalId(claim.getPayerId(), hospitalId).orElse(null);
                    String collectedBy = payer != null ? payer.getName() + " (claim settlement)" : "Claim settlement";
                    // atomicLedger=true: the bank CREDIT joins THIS transaction, so a
                    // ledger failure rolls the settlement back instead of leaving a
                    // settled claim with no matching bank credit (Sprint 2b §1).
                    invoiceService.collectPayment(claim.getInvoiceId(), settled, "Insurance",
                            req.getBankAccountId(), collectedBy, principal, true);
                }

                claim.setSettledAmount(settled);
                claim.setStatus("SETTLED");
                claim.setSettledAt(LocalDateTime.now());
            }
            default -> throw new BadRequestException(
                    "Unknown action: " + action
                    + " (use PRE_AUTH, SUBMIT, QUERY, RESPOND, APPROVE, DENY, "
                    + "REQUEST_ENHANCEMENT, APPROVE_ENHANCEMENT, DENY_ENHANCEMENT or SETTLE)");
        }

        // Derive which side the ball is on from the resulting status, and reset the
        // pending clock whenever we enter a fresh non-NONE pending state.
        applyPending(claim);

        // Every transition is on the record: who moved it from where to where, when.
        recordEvent(claim, "STATUS_CHANGE", from + " → " + claim.getStatus(), null, principal);

        // Any note the caller tacked on (that an action above didn't already turn
        // into its own event) is appended as a NOTE — never written to the legacy
        // claim.notes column.
        if (!notesConsumed) {
            String note = trimToNull(req.getNotes());
            if (note != null) {
                recordEvent(claim, "NOTE", note, null, principal);
            }
        }
        return claimRepository.save(claim);
    }

    /**
     * NOTE_DEDUCTION: record WHY a settled claim was paid short of its approval,
     * split by disposition. The claim STAYS SETTLED (terminal) and — critically —
     * the invoice is NEVER touched: these lines re-classify a portion of the
     * invoice's already-existing outstanding, they do not add a charge (Sprint 2b
     * §3). Lines + the DEDUCTION_NOTED event are written in this one transaction,
     * so a rejected or failed marking persists nothing.
     */
    private InvoiceClaim noteDeduction(InvoiceClaim claim, TransitionRequest req, User principal) {
        requireState(claim.getStatus(), Set.of("SETTLED"), "NOTE_DEDUCTION");

        BigDecimal gap = nz(claim.getApprovedAmount()).subtract(nz(claim.getSettledAmount()))
                .setScale(2, RoundingMode.HALF_UP);
        if (gap.signum() <= 0) {
            throw new BadRequestException(
                    "No deduction to note: the settled amount is not less than the approved amount.");
        }
        if (deductionLineRepository.countByClaim_Id(claim.getId()) > 0) {
            throw new BadRequestException("A deduction has already been noted for this claim.");
        }

        List<DeductionLineRequest> lines = req.getDeductions();
        if (lines == null || lines.isEmpty()) {
            throw new BadRequestException("At least one deduction line is required.");
        }

        // Validate every line first, build the rows, and only persist once the whole
        // batch is known-good AND sums exactly to the gap — no partial writes.
        BigDecimal sum = BigDecimal.ZERO;
        StringBuilder summary = new StringBuilder();
        List<ClaimDeductionLine> rows = new ArrayList<>();
        for (DeductionLineRequest line : lines) {
            String disposition = required(line.getDisposition(), "disposition is required").toUpperCase();
            if (!DISPOSITIONS.contains(disposition)) {
                throw new BadRequestException("disposition must be one of " + DISPOSITIONS);
            }
            BigDecimal amount = line.getAmount();
            if (amount == null || amount.signum() <= 0) {
                throw new BadRequestException("Each deduction line amount must be greater than zero");
            }
            amount = amount.setScale(2, RoundingMode.HALF_UP);
            String reason = required(line.getReason(), "A reason is required for every deduction line");
            sum = sum.add(amount);
            rows.add(ClaimDeductionLine.builder()
                    .claim(claim)
                    .disposition(disposition)
                    .amount(amount)
                    .reason(reason)
                    .actorUserId(principal != null ? principal.getId() : null)
                    .actorName(principal != null ? principal.getEmail() : null)
                    .build());
            if (summary.length() > 0) summary.append(", ");
            summary.append(disposition).append(' ').append(amount);
        }

        // Exact-decimal reconciliation: the dispositioned lines must account for the
        // WHOLE deduction, to the paise. compareTo (not equals) so 2.50 == 2.5.
        if (sum.compareTo(gap) != 0) {
            throw new BadRequestException("Deduction lines must sum exactly to the deducted amount ("
                    + gap + "); got " + sum + ".");
        }

        deductionLineRepository.saveAll(rows);
        recordEvent(claim, "DEDUCTION_NOTED", "Deduction " + gap + " noted: " + summary, null, principal);
        // No status change, no invoice write — classification only.
        return claimRepository.save(claim);
    }

    /** Append one immutable event in the same transaction as its status change. */
    private void recordEvent(InvoiceClaim claim, String eventType, String body,
                             LocalDate dueDate, User principal) {
        claimEventRepository.save(ClaimEvent.builder()
                .claim(claim)
                .eventType(eventType)
                .body(body)
                .dueDate(dueDate)
                .actorUserId(principal != null ? principal.getId() : null)
                .actorName(principal != null ? principal.getEmail() : null)
                .build());
    }

    /** pending_with is a pure function of status; pending_since resets on each non-NONE entry. */
    private static void applyPending(InvoiceClaim claim) {
        String pw = pendingWithFor(claim.getStatus());
        claim.setPendingWith(pw);
        claim.setPendingSince("NONE".equals(pw) ? null : LocalDateTime.now());
    }

    private static String pendingWithFor(String status) {
        return switch (status) {
            case "DRAFT", "PRE_AUTH", "QUERIED" -> "HOSPITAL";
            case "SUBMITTED", "ENHANCEMENT_REQUESTED" -> "PAYER";
            default -> "NONE"; // APPROVED, PARTIALLY_APPROVED, DENIED, SETTLED
        };
    }

    /** Claims list + status-wise KPI totals, enriched with invoice/payer context. */
    @Transactional(readOnly = true)
    public ClaimsSummary getSummary(UUID hospitalId, String status) {
        List<InvoiceClaim> claims = (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status))
                ? claimRepository.findByHospitalIdOrderByCreatedAtDesc(hospitalId)
                : claimRepository.findByHospitalIdAndStatusOrderByCreatedAtDesc(hospitalId, status.toUpperCase());

        // KPI totals always cover ALL claims for the hospital, independent of the list filter.
        List<InvoiceClaim> all = claimRepository.findByHospitalIdOrderByCreatedAtDesc(hospitalId);

        // One batched lookup of every referenced invoice — reused by both the KPI
        // loop (needs_enhancement) and the response mapping (invoice number/total),
        // replacing the previous per-claim findById.
        Map<UUID, Invoice> invoiceById = new HashMap<>();
        invoiceRepository.findAllById(
                all.stream().map(InvoiceClaim::getInvoiceId).collect(java.util.stream.Collectors.toSet())
        ).forEach(inv -> invoiceById.put(inv.getId(), inv));

        // Batched load of every deduction line across this page of claims, grouped by
        // claim — one query, reused by both the KPI buckets and the per-claim response.
        Map<UUID, List<ClaimDeductionLine>> deductionsByClaim = new HashMap<>();
        if (!all.isEmpty()) {
            deductionLineRepository.findByClaim_IdIn(
                    all.stream().map(InvoiceClaim::getId).collect(java.util.stream.Collectors.toSet())
            ).forEach(dl -> deductionsByClaim
                    .computeIfAbsent(dl.getClaim().getId(), k -> new ArrayList<>()).add(dl));
        }
        BigDecimal deductionWriteOffTotal = BigDecimal.ZERO, deductionAppealTotal = BigDecimal.ZERO,
                deductionRecoverTotal = BigDecimal.ZERO;
        for (List<ClaimDeductionLine> ls : deductionsByClaim.values()) {
            for (ClaimDeductionLine dl : ls) {
                switch (dl.getDisposition()) {
                    case "WRITE_OFF" -> deductionWriteOffTotal = deductionWriteOffTotal.add(nz(dl.getAmount()));
                    case "APPEAL" -> deductionAppealTotal = deductionAppealTotal.add(nz(dl.getAmount()));
                    case "RECOVER_FROM_PATIENT" -> deductionRecoverTotal = deductionRecoverTotal.add(nz(dl.getAmount()));
                    default -> { /* unknown disposition: ignored in buckets */ }
                }
            }
        }

        long openCount = 0, queriedCount = 0, waitingOnPayerCount = 0, waitingOnHospitalCount = 0,
                approvedCount = 0, enhancementRequestedCount = 0, needsEnhancementCount = 0,
                deniedCount = 0, settledCount = 0, deductionUnmarkedCount = 0;
        BigDecimal openClaimed = BigDecimal.ZERO, approvedAmount = BigDecimal.ZERO,
                deniedClaimed = BigDecimal.ZERO, settledAmount = BigDecimal.ZERO;
        for (InvoiceClaim c : all) {
            // Legacy rows (pre-migration) may have a null pending_with; treat as NONE.
            String pw = c.getPendingWith();
            if ("PAYER".equals(pw)) waitingOnPayerCount++;
            else if ("HOSPITAL".equals(pw)) waitingOnHospitalCount++;
            if (needsEnhancement(c, invoiceById.get(c.getInvoiceId()))) needsEnhancementCount++;
            switch (c.getStatus()) {
                case "DRAFT", "PRE_AUTH", "SUBMITTED", "QUERIED" -> {
                    openCount++;
                    openClaimed = openClaimed.add(nz(c.getClaimedAmount()));
                    if ("QUERIED".equals(c.getStatus())) queriedCount++;
                }
                // ENHANCEMENT_REQUESTED is an approved claim with a raise in flight —
                // it still carries approved_amount, so it counts in the approved totals
                // (and shows under "Waiting on TPA" via pending_with).
                case "APPROVED", "PARTIALLY_APPROVED", "ENHANCEMENT_REQUESTED" -> {
                    approvedCount++;
                    approvedAmount = approvedAmount.add(nz(c.getApprovedAmount()));
                    if ("ENHANCEMENT_REQUESTED".equals(c.getStatus())) enhancementRequestedCount++;
                }
                case "DENIED" -> {
                    deniedCount++;
                    deniedClaimed = deniedClaimed.add(nz(c.getClaimedAmount()));
                }
                case "SETTLED" -> {
                    settledCount++;
                    settledAmount = settledAmount.add(nz(c.getSettledAmount()));
                    // Payer paid short of approval but no one has said why yet — a worklist signal.
                    boolean shortPaid = c.getApprovedAmount() != null
                            && nz(c.getSettledAmount()).compareTo(c.getApprovedAmount()) < 0;
                    if (shortPaid && deductionsByClaim.getOrDefault(c.getId(), List.of()).isEmpty()) {
                        deductionUnmarkedCount++;
                    }
                }
                default -> { /* unknown status: excluded from KPIs, still listed */ }
            }
        }

        Map<UUID, Payer> payers = new HashMap<>();
        payerRepository.findByHospitalIdOrderByNameAsc(hospitalId).forEach(p -> payers.put(p.getId(), p));

        List<ClaimResponse> responses = claims.stream().map(c -> {
            Invoice inv = invoiceById.get(c.getInvoiceId());
            Payer payer = payers.get(c.getPayerId());
            List<ClaimDeductionLine> dls = deductionsByClaim.getOrDefault(c.getId(), List.of());
            // Per-claim deduction breakdown for the deduction-aware invoice/claims views.
            boolean shortPaid = "SETTLED".equals(c.getStatus()) && c.getApprovedAmount() != null
                    && nz(c.getSettledAmount()).compareTo(c.getApprovedAmount()) < 0;
            BigDecimal cGap = shortPaid
                    ? c.getApprovedAmount().subtract(nz(c.getSettledAmount())).setScale(2, RoundingMode.HALF_UP)
                    : null;
            BigDecimal cWrite = sumDisposition(dls, "WRITE_OFF");
            BigDecimal cAppeal = sumDisposition(dls, "APPEAL");
            BigDecimal cRecover = sumDisposition(dls, "RECOVER_FROM_PATIENT");
            return ClaimResponse.builder()
                    .id(c.getId())
                    .invoiceId(c.getInvoiceId())
                    .invoiceNumber(inv != null ? inv.getInvoiceNumber() : null)
                    .patientName(inv != null && inv.getPatient() != null
                            ? ((inv.getPatient().getFirstName() != null ? inv.getPatient().getFirstName() : "")
                               + " "
                               + (inv.getPatient().getLastName() != null ? inv.getPatient().getLastName() : "")).trim()
                            : null)
                    .payerId(c.getPayerId())
                    .payerName(payer != null ? payer.getName() : null)
                    .payerType(payer != null ? payer.getType() : null)
                    .status(c.getStatus())
                    .pendingWith(c.getPendingWith())
                    .ageDays(ageDays(c))
                    .claimedAmount(c.getClaimedAmount())
                    .approvedAmount(c.getApprovedAmount())
                    .requestedAmount(c.getRequestedAmount())
                    .settledAmount(c.getSettledAmount())
                    .invoiceTotal(inv != null ? inv.getTotal() : null)
                    .needsEnhancement(needsEnhancement(c, inv))
                    .preAuthNo(c.getPreAuthNo())
                    .tpaClaimNo(c.getTpaClaimNo())
                    .denialReason(c.getDenialReason())
                    .notes(c.getNotes())
                    .submittedAt(c.getSubmittedAt())
                    .decidedAt(c.getDecidedAt())
                    .settledAt(c.getSettledAt())
                    .createdByName(c.getCreatedByName())
                    .createdAt(c.getCreatedAt())
                    .deductionTotal(cGap)
                    .deductionWrittenOff(cWrite)
                    .deductionAppealed(cAppeal)
                    .deductionToRecover(cRecover)
                    .deductionUnmarked(shortPaid && dls.isEmpty())
                    .deductions(dls.stream()
                            .sorted(java.util.Comparator.comparing(ClaimDeductionLine::getCreatedAt))
                            .map(dl -> DeductionLineResponse.builder()
                                    .id(dl.getId())
                                    .disposition(dl.getDisposition())
                                    .amount(dl.getAmount())
                                    .reason(dl.getReason())
                                    .actorName(dl.getActorName())
                                    .createdAt(dl.getCreatedAt())
                                    .build())
                            .toList())
                    .build();
        }).toList();

        return ClaimsSummary.builder()
                .openCount(openCount).openClaimed(openClaimed)
                .queriedCount(queriedCount)
                .waitingOnPayerCount(waitingOnPayerCount)
                .waitingOnHospitalCount(waitingOnHospitalCount)
                .approvedCount(approvedCount).approvedAmount(approvedAmount)
                .enhancementRequestedCount(enhancementRequestedCount)
                .needsEnhancementCount(needsEnhancementCount)
                .deniedCount(deniedCount).deniedClaimed(deniedClaimed)
                .settledCount(settledCount).settledAmount(settledAmount)
                .deductionWriteOffTotal(deductionWriteOffTotal)
                .deductionAppealTotal(deductionAppealTotal)
                .deductionRecoverTotal(deductionRecoverTotal)
                .deductionUnmarkedCount(deductionUnmarkedCount)
                .claims(responses)
                .build();
    }

    /** Sum of a claim's deduction lines with the given disposition (never null). */
    private static BigDecimal sumDisposition(List<ClaimDeductionLine> lines, String disposition) {
        BigDecimal sum = BigDecimal.ZERO;
        for (ClaimDeductionLine dl : lines) {
            if (disposition.equals(dl.getDisposition())) sum = sum.add(nz(dl.getAmount()));
        }
        return sum;
    }

    /** The append-only event thread for one claim (oldest first). Hospital-scoped. */
    @Transactional(readOnly = true)
    public List<ClaimEventResponse> listEvents(UUID hospitalId, UUID claimId) {
        InvoiceClaim claim = claimRepository.findByIdAndHospitalId(claimId, hospitalId)
                .orElseThrow(() -> new BadRequestException("Claim not found"));
        return claimEventRepository.findByClaim_IdOrderByCreatedAtAsc(claim.getId()).stream()
                .map(e -> ClaimEventResponse.builder()
                        .id(e.getId())
                        .claimId(claim.getId())
                        .eventType(e.getEventType())
                        .body(e.getBody())
                        .actorName(e.getActorName())
                        .dueDate(e.getDueDate())
                        .createdAt(e.getCreatedAt())
                        .build())
                .toList();
    }

    // ── helpers ──

    /**
     * True when an approved claim's bill has outgrown its approval — the signal that
     * the desk SHOULD raise an enhancement. Detection only; never auto-raises.
     * Only meaningful for APPROVED/PARTIALLY_APPROVED (not settled, no enhancement
     * already in flight); false for every other status.
     */
    private static boolean needsEnhancement(InvoiceClaim c, Invoice inv) {
        if (!"APPROVED".equals(c.getStatus()) && !"PARTIALLY_APPROVED".equals(c.getStatus())) return false;
        if (inv == null || inv.getTotal() == null || c.getApprovedAmount() == null) return false;
        return inv.getTotal().compareTo(c.getApprovedAmount()) > 0;
    }

    /** Days since the claim entered its current pending state; null when NONE/legacy. */
    private static Long ageDays(InvoiceClaim c) {
        LocalDateTime since = c.getPendingSince();
        if (since == null) return null;
        return ChronoUnit.DAYS.between(since.toLocalDate(), LocalDate.now());
    }

    private static void requireState(String current, Set<String> allowed, String action) {
        if (!allowed.contains(current)) {
            throw new BadRequestException(
                    "Cannot " + action + " a claim in status " + current + " (allowed from: " + allowed + ")");
        }
    }

    private static String required(String v, String message) {
        if (v == null || v.isBlank()) throw new BadRequestException(message);
        return v.trim();
    }

    private static String trimToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
