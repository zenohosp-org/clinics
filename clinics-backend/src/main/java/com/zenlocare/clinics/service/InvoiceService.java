package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.InvoiceDTO;
import com.zenlocare.clinics.dto.InvoiceRequest;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.entity.Appointment;
import com.zenlocare.clinics.entity.InvoicePayment;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.HashMap;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceService {

    private static String userDisplayName(User u) {
        if (u == null) return null;
        String name = ((u.getFirstName() != null ? u.getFirstName() : "") + " "
                + (u.getLastName() != null ? u.getLastName() : "")).trim();
        return !name.isEmpty() ? name : u.getEmail();
    }

    private final InvoiceRepository invoiceRepository;
    private final HospitalRepository hospitalRepository;
    private final PatientRepository patientRepository;
    private final AdmissionRepository admissionRepository;
    private final AppointmentRepository appointmentRepository;
    private final SpecializationRepository specializationRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BankTransactionRepository bankTransactionRepository;
    private final PatientAdvanceService patientAdvanceService;
    private final InvoicePaymentRepository invoicePaymentRepository;
    private final BankLedgerService bankLedgerService;
    private final PatientServiceRepository patientServiceRepository;
    private final AmbulanceBookingRepository ambulanceBookingRepository;

    @Transactional
    public Invoice createInvoice(InvoiceRequest request) {
        // Idempotency by invoiceNumber. External callers (OTM's walk-in invoice
        // push) retry after network timeouts — if the first attempt actually
        // persisted, the retry must return the existing invoice, not fail on the
        // unique constraint forever. Only a true retry qualifies: same patient
        // and same total. A different invoice colliding on the number is a
        // caller bug and still fails loudly.
        if (request.getInvoiceNumber() != null) {
            Invoice existing = invoiceRepository.findByInvoiceNumber(request.getInvoiceNumber());
            if (existing != null) {
                boolean samePatient = existing.getPatient() != null
                        && existing.getPatient().getId().equals(request.getPatientId());
                boolean sameTotal = existing.getTotal() != null && request.getTotal() != null
                        && existing.getTotal().compareTo(request.getTotal()) == 0;
                if (samePatient && sameTotal) {
                    return existing;
                }
                throw new RuntimeException("Invoice number already exists with different details: "
                        + request.getInvoiceNumber());
            }
        }

        Hospital hospital = hospitalRepository.findById(request.getHospitalId())
                .orElseThrow(() -> new RuntimeException("Hospital not found"));
        Patient patient = patientRepository.findById(request.getPatientId())
                .orElseThrow(() -> new RuntimeException("Patient not found"));

        Invoice invoice = Invoice.builder()
                .invoiceNumber(request.getInvoiceNumber())
                .hospital(hospital)
                .patient(patient)
                .subtotal(request.getSubtotal())
                .tax(request.getTax())
                .discount(request.getDiscount())
                .total(request.getTotal())
                .notes(request.getNotes())
                .paymentMethod(request.getPaymentMethod())
                .status(request.getStatus() != null ? request.getStatus() : InvoiceStatus.UNPAID)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        if (request.getAdmissionId() != null) {
            invoice.setAdmission(admissionRepository.findById(request.getAdmissionId()).orElse(null));
        }
        if (request.getAppointmentId() != null) {
            invoice.setAppointment(appointmentRepository.findById(request.getAppointmentId()).orElse(null));
        }
        if (request.getSpecializationId() != null) {
            invoice.setSpecialization(specializationRepository.findById(request.getSpecializationId()).orElse(null));
        }

        if (request.getItems() != null) {
            List<InvoiceItem> items = request.getItems().stream().map(itemRequest ->
                InvoiceItem.builder()
                        .invoice(invoice)
                        .serviceId(itemRequest.getServiceId())
                        .radiologyOrderId(itemRequest.getRadiologyOrderId())
                        .appointmentId(itemRequest.getAppointmentId())
                        .otBookingId(itemRequest.getOtBookingId())
                        .otInvoiceItemId(itemRequest.getOtInvoiceItemId())
                        .itemType(itemRequest.getItemType())
                        .description(itemRequest.getDescription())
                        .quantity(itemRequest.getQuantity())
                        .unitPrice(itemRequest.getUnitPrice())
                        .totalPrice(itemRequest.getTotalPrice())
                        .build()
            ).collect(Collectors.toList());
            invoice.setItems(items);

            // Staff-built invoice with a REGISTRATION line manually added → mark the
            // patient registered so the auto-flow won't add another one later.
            boolean hasReg = items.stream().anyMatch(i -> "REGISTRATION".equals(i.getItemType()));
            if (hasReg && !Boolean.TRUE.equals(patient.getRegistrationFeePaid())) {
                patient.setRegistrationFeePaid(true);
                patientRepository.save(patient);
            }
        }

        Invoice saved = invoiceRepository.save(invoice);

        // Radiology orders live in labs now; labs flips the status on its own
        // report-generation flow. HMS no longer touches the radiology lifecycle
        // even when an invoice line item carries radiology_order_id.

        // Mark linked appointments as BILLED — same transaction, atomic with invoice save.
        if (saved.getItems() != null) {
            saved.getItems().stream()
                .filter(item -> "CONSULTATION".equals(item.getItemType()) && item.getAppointmentId() != null)
                .forEach(item -> appointmentRepository.findById(item.getAppointmentId())
                    .ifPresent(appt -> {
                        appt.setStatus(Appointment.AppointmentStatus.BILLED);
                        appointmentRepository.save(appt);
                    }));
        }

        // If paid immediately, credit the selected bank account
        if (InvoiceStatus.PAID.equals(saved.getStatus()) && request.getBankAccountId() != null) {
            creditBankAccount(request.getBankAccountId(), saved);
        }

        return saved;
    }

    @Transactional
    public Invoice markAsPaid(UUID invoiceId, UUID bankAccountId, User user) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new RuntimeException("Invoice not found"));
        if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) {
            throw new RuntimeException("Invoice is already paid");
        }
        // Refuse to flip status unless the money to cover it is actually present.
        // Old behaviour: this endpoint blindly set SETTLED — a stray click on the
        // "Mark as Paid" button could close a partially-paid IPD bill. Now we
        // require paidAmount + advance >= total, matching the same fullyPaid
        // check that collectPayment / collectAndSave use.
        BigDecimal paid    = invoice.getPaidAmount()      != null ? invoice.getPaidAmount()      : BigDecimal.ZERO;
        BigDecimal advance = invoice.getAdvanceAdjusted() != null ? invoice.getAdvanceAdjusted() : BigDecimal.ZERO;
        BigDecimal total   = invoice.getTotal()           != null ? invoice.getTotal()           : BigDecimal.ZERO;
        if (paid.add(advance).compareTo(total) < 0) {
            BigDecimal balance = total.subtract(paid).subtract(advance);
            throw new RuntimeException(
                    "Cannot mark paid — outstanding balance ₹" + balance
                            + " (paid ₹" + paid + " + advance ₹" + advance + " < total ₹" + total
                            + "). Collect the remaining amount via the payment flow first.");
        }
        invoice.setStatus(invoice.getAdmission() != null ? InvoiceStatus.SETTLED : InvoiceStatus.PAID);
        invoice.setUpdatedAt(LocalDateTime.now());
        invoice.setUpdatedBy(user);
        Invoice saved = invoiceRepository.save(invoice);
        if (bankAccountId != null) {
            creditBankAccount(bankAccountId, saved);
        }
        return saved;
    }

    @Transactional
    public InvoiceDTO collectPayment(UUID invoiceId, BigDecimal amount, String paymentMethod,
                                     UUID bankAccountId, String collectedBy, User user) {
        // Default (counter/OPD/IPD) collection keeps the isolated REQUIRES_NEW ledger
        // write with a log-only catch — see the atomicLedger=false branch below.
        return collectPayment(invoiceId, amount, paymentMethod, bankAccountId, collectedBy, user, false);
    }

    /**
     * As above, but {@code atomicLedger} controls how the bank CREDIT is written.
     * false (default/counter): isolated REQUIRES_NEW write, log-only catch — a
     * ledger failure can't roll back the payment. true (claim settlement): the
     * ledger write JOINS this transaction and its failure propagates, so the
     * settlement, its InvoicePayment, the invoice status change and the bank
     * CREDIT all commit or roll back together. Sprint 2b §1 scoped the atomic
     * variant to claim settlement only; the counter path's gap is tracked in
     * docs/schemas/KNOWN_RECONCILIATION_GAPS.md (#1).
     */
    @Transactional
    public InvoiceDTO collectPayment(UUID invoiceId, BigDecimal amount, String paymentMethod,
                                     UUID bankAccountId, String collectedBy, User user,
                                     boolean atomicLedger) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new RuntimeException("Invoice not found"));
        if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) {
            throw new RuntimeException("Invoice is already fully paid");
        }
        // Guard against negative / zero / overpayment. Overpayment was previously
        // accepted silently and would push paidAmount > total without an error,
        // confusing the discharge gate and ledger reconciliation.
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("Payment amount must be positive");
        }
        BigDecimal alreadyPaid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal alreadyAdvance = invoice.getAdvanceAdjusted() != null ? invoice.getAdvanceAdjusted() : BigDecimal.ZERO;
        BigDecimal invTotal = invoice.getTotal() != null ? invoice.getTotal() : BigDecimal.ZERO;
        BigDecimal remaining = invTotal.subtract(alreadyPaid).subtract(alreadyAdvance);
        if (amount.compareTo(remaining) > 0) {
            throw new RuntimeException("Payment ₹" + amount + " exceeds outstanding balance ₹" + remaining);
        }

        InvoicePayment payment = InvoicePayment.builder()
                .invoice(invoice)
                .amount(amount)
                .paymentMethod(paymentMethod)
                .bankAccountId(bankAccountId)
                .collectedBy(collectedBy)
                .build();
        payment.setCollectedByUser(user);
        invoicePaymentRepository.save(payment);

        BigDecimal newPaid = (invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO)
                .add(amount);
        invoice.setPaidAmount(newPaid);
        invoice.setUpdatedAt(LocalDateTime.now());
        invoice.setUpdatedBy(user);

        BigDecimal advance = invoice.getAdvanceAdjusted() != null ? invoice.getAdvanceAdjusted() : BigDecimal.ZERO;
        BigDecimal total = invoice.getTotal() != null ? invoice.getTotal() : BigDecimal.ZERO;
        boolean fullyPaid = newPaid.add(advance).compareTo(total) >= 0;

        boolean isIpd = invoice.getAdmission() != null;
        invoice.setStatus(fullyPaid
                ? (isIpd ? InvoiceStatus.SETTLED  : InvoiceStatus.PAID)
                : (isIpd ? InvoiceStatus.UNSETTLED : InvoiceStatus.PARTIAL));

        if (fullyPaid && isIpd && advance.compareTo(BigDecimal.ZERO) > 0) {
            try {
                patientAdvanceService.markAdvancesApplied(
                        invoice.getAdmission().getId(), invoice.getId(), advance);
            } catch (Exception e) {
                // REQUIRES_NEW on markAdvancesApplied — its failure can't roll back the
                // invoice update, but reconciliation will be off until we re-apply
                // manually. Log loudly so it shows up in monitoring.
                log.error("markAdvancesApplied failed for invoice {} admission {} (advance ₹{}): {}",
                        invoice.getId(), invoice.getAdmission().getId(), advance, e.getMessage(), e);
            }
        }

        if (bankAccountId != null) {
            if (atomicLedger) {
                // Claim-settlement path: the ledger write joins THIS transaction and
                // its failure propagates on purpose. No catch — a failed bank credit
                // must roll the whole settlement back (InvoicePayment, invoice status,
                // and the SETTLED claim + its events in the caller's transaction), so
                // money can never land in one place without the other.
                bankLedgerService.creditPaymentRequired(bankAccountId, amount,
                        "Payment — " + invoice.getInvoiceNumber(), invoice.getInvoiceNumber(), invoice.getId());
            } else {
                try { bankLedgerService.creditPayment(bankAccountId, amount,
                        "Payment — " + invoice.getInvoiceNumber(), invoice.getInvoiceNumber(), invoice.getId());
                } catch (Exception e) {
                    // Bank ledger is REQUIRES_NEW; failing here leaves the invoice marked
                    // paid but no corresponding bank credit row. Surface clearly so ops
                    // can backfill the ledger entry rather than silently shipping a
                    // reconciliation gap. (Counter path only — see KNOWN_RECONCILIATION_GAPS #1.)
                    log.error("Bank ledger credit failed for invoice {} amount ₹{} on account {}: {}",
                            invoice.getId(), amount, bankAccountId, e.getMessage(), e);
                }
            }
        }

        return toDTO(invoiceRepository.save(invoice));
    }

    private void creditBankAccount(UUID bankAccountId, Invoice invoice) {
        bankAccountRepository.findById(bankAccountId).ifPresent(account -> {
            bankTransactionRepository.save(BankTransaction.builder()
                    .hospitalId(account.getHospitalId())
                    .bankAccountId(bankAccountId)
                    .amount(invoice.getTotal())
                    .type("CREDIT")
                    .description("Invoice payment — " + invoice.getInvoiceNumber())
                    .referenceNo(invoice.getInvoiceNumber())
                    .relatedEntityId(invoice.getId())
                    .relatedEntityType("INVOICE")
                    .transactionDate(LocalDateTime.now())
                    .build());
        });
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<InvoiceDTO> getHospitalInvoices(UUID hospitalId) {
        return invoiceRepository.findByHospitalIdWithPatient(hospitalId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public List<InvoiceDTO> getPatientInvoices(Integer patientId) {
        return invoiceRepository.findByPatientIdWithPatient(patientId)
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public Invoice getInvoice(UUID id) {
        return invoiceRepository.findById(id).orElseThrow(() -> new RuntimeException("Invoice not found"));
    }

    // ── Auto-create a zero-total placeholder invoice when a patient is admitted ──
    // OPD→IPD edge case: if the admission originated from an OPD appointment that
    // already has an unpaid invoice, absorb it — link it to this admission so the
    // consultation fee carries over into the IPD bill. No separate OPD invoice remains.
    // sourceAppointmentId is passed directly from the caller to avoid lazy-loading the
    // Admission.sourceAppointment proxy inside this transaction.
    @Transactional
    public void createAdmissionInvoice(UUID hospitalId, Integer patientId, UUID admissionId,
                                       String admissionNumber, UUID sourceAppointmentId) {
        if (!invoiceRepository.findAllByAdmission_IdOrderByCreatedAtDesc(admissionId).isEmpty()) return;
        Hospital hospital = hospitalRepository.findById(hospitalId).orElse(null);
        Patient patient = patientRepository.findById(patientId).orElse(null);
        Admission admission = admissionRepository.findById(admissionId).orElse(null);
        if (hospital == null || patient == null || admission == null) return;

        // Auto-merge an OPD invoice into this admission when one of two signals fires:
        //   (1) sourceAppointmentId is supplied — the admit was launched from an OPD appointment row.
        //   (2) admission.admissionType == OPD_REFERRAL — staff marked the admission as coming from OPD,
        //       even if they didn't link a specific appointment (e.g. admitted from /admissions).
        // The same promotion logic applies: the OPD invoice gets the admission FK, a renamed
        // IPD invoice number, and an audit note. No duplicate IPD invoice is created.
        Invoice opdToMerge = pickOpdInvoiceToMerge(admission, hospitalId, patientId, sourceAppointmentId);
        if (opdToMerge != null) {
            promoteOpdInvoiceToIpd(opdToMerge, admission, hospital, admissionNumber);
            return;
        }
        log.info("OPD→IPD merge: no merge for admission {} (sourceApptId={}, admissionType={}) — creating fresh IPD invoice",
                admissionId, sourceAppointmentId, admission.getAdmissionType());

        // Direct IPD admission (no OPD source) — add one-time registration fee if never charged.
        // Patient.registrationFeePaid is the canonical signal; once true it never resets.
        Optional<BigDecimal> regFeeOpt = findRegistrationFee(hospitalId);
        BigDecimal regFee = regFeeOpt.orElse(null);
        boolean addReg = regFee != null && !Boolean.TRUE.equals(patient.getRegistrationFeePaid());
        // Strip embedded hospital prefix from admissionNumber so the invoice number has the
        // hospital code at the START exactly once: e.g. "1001-IPD-ADM-2026-0001"
        Invoice admissionInvoice = Invoice.builder()
                .invoiceNumber(HospitalIdPrefix.of(hospital) + "IPD-"
                        + HospitalIdPrefix.stripHospitalPrefix(admissionNumber))
                .hospital(hospital)
                .patient(patient)
                .admission(admission)
                .subtotal(addReg ? regFee : BigDecimal.ZERO)
                .tax(BigDecimal.ZERO)
                .discount(BigDecimal.ZERO)
                .total(addReg ? regFee : BigDecimal.ZERO)
                .status(InvoiceStatus.UNSETTLED)
                .notes("IPD Admission — " + admissionNumber)
                .build();
        if (addReg) {
            admissionInvoice.setItems(new ArrayList<>(List.of(InvoiceItem.builder()
                    .invoice(admissionInvoice)
                    .itemType("REGISTRATION")
                    .description("Registration Fee")
                    .quantity(1)
                    .unitPrice(regFee)
                    .totalPrice(regFee)
                    .build())));
            patient.setRegistrationFeePaid(true);
            patientRepository.save(patient);
        }
        invoiceRepository.save(admissionInvoice);
    }

    // ── Two-stage OPD invoice creation ─────────────────────────────────────────
    // CONFIRMED → createAppointmentInvoice(id, false) : ₹0 placeholder, no items
    // COMPLETED → createAppointmentInvoice(id, true)  : adds consultation fee to existing (or new) invoice
    @Transactional
    public void createAppointmentInvoice(UUID appointmentId, boolean includeConsultation) {
        Appointment appt = appointmentRepository.findById(appointmentId).orElse(null);
        if (appt == null || appt.getHospital() == null || appt.getPatient() == null) return;

        String invoiceNum = HospitalIdPrefix.of(appt.getHospital())
                + "OPD-" + appointmentId.toString().replace("-", "").substring(0, 12).toUpperCase();
        Optional<Invoice> existing = invoiceRepository.findByAppointment_Id(appointmentId)
                .filter(inv -> inv.getStatus() != InvoiceStatus.CANCELLED);

        if (existing.isPresent()) {
            if (!includeConsultation) return;
            Invoice invoice = existing.get();
            if (InvoiceStatus.PAID.equals(invoice.getStatus())) return;
            boolean alreadyHasFee = invoice.getItems() != null && invoice.getItems().stream()
                    .anyMatch(i -> "CONSULTATION".equals(i.getItemType()));
            if (alreadyHasFee) return;
            Doctor doc = appt.getDoctor();
            if (doc == null) return;
            boolean isFollowUp = appt.getType() == Appointment.AppointmentType.FOLLOWUP;
            BigDecimal fee = (isFollowUp && doc.getFollowUpFee() != null && doc.getFollowUpFee().compareTo(BigDecimal.ZERO) > 0)
                    ? doc.getFollowUpFee()
                    : (doc.getConsultationFee() != null ? doc.getConsultationFee() : BigDecimal.ZERO);
            if (fee.compareTo(BigDecimal.ZERO) == 0) return;
            String feeLabel = isFollowUp ? "Follow-up" : "Consultation";
            String docName = doc.getUser() != null
                    ? doc.getUser().getFirstName() + " " + doc.getUser().getLastName() : "Doctor";
            if (invoice.getItems() == null) invoice.setItems(new ArrayList<>());
            invoice.getItems().add(InvoiceItem.builder()
                    .invoice(invoice)
                    .itemType("CONSULTATION")
                    .description(feeLabel + " - Dr. " + docName)
                    .quantity(1)
                    .unitPrice(fee)
                    .totalPrice(fee)
                    .appointmentId(appt.getId())
                    .build());
            BigDecimal newSubtotal = invoice.getSubtotal().add(fee);
            // Add one-time registration fee if this patient has never been charged it
            Optional<BigDecimal> regFeeOptE = findRegistrationFee(appt.getHospital().getId());
            if (regFeeOptE.isPresent()
                    && !Boolean.TRUE.equals(appt.getPatient().getRegistrationFeePaid())) {
                BigDecimal regFee = regFeeOptE.get();
                invoice.getItems().add(InvoiceItem.builder()
                        .invoice(invoice)
                        .itemType("REGISTRATION")
                        .description("Registration Fee")
                        .quantity(1)
                        .unitPrice(regFee)
                        .totalPrice(regFee)
                        .build());
                newSubtotal = newSubtotal.add(regFee);
                appt.getPatient().setRegistrationFeePaid(true);
                patientRepository.save(appt.getPatient());
            }
            invoice.setSubtotal(newSubtotal);
            invoice.setTotal(newSubtotal.add(invoice.getTax() != null ? invoice.getTax() : BigDecimal.ZERO)
                    .subtract(invoice.getDiscount() != null ? invoice.getDiscount() : BigDecimal.ZERO));
            invoice.setUpdatedAt(LocalDateTime.now());
            invoiceRepository.save(invoice);
            appt.setStatus(Appointment.AppointmentStatus.BILLED);
            appointmentRepository.save(appt);
        } else {
            if (includeConsultation && appt.getDoctor() != null) {
                Doctor doc = appt.getDoctor();
                boolean isFollowUp = appt.getType() == Appointment.AppointmentType.FOLLOWUP;
                BigDecimal fee = (isFollowUp && doc.getFollowUpFee() != null && doc.getFollowUpFee().compareTo(BigDecimal.ZERO) > 0)
                        ? doc.getFollowUpFee()
                        : (doc.getConsultationFee() != null ? doc.getConsultationFee() : BigDecimal.ZERO);
                String feeLabel = isFollowUp ? "Follow-up" : "Consultation";
                String docName = doc.getUser() != null
                        ? doc.getUser().getFirstName() + " " + doc.getUser().getLastName() : "Doctor";
                List<InvoiceItem> newItems = new ArrayList<>();
                Invoice invoice = Invoice.builder()
                        .invoiceNumber(invoiceNum)
                        .hospital(appt.getHospital())
                        .patient(appt.getPatient())
                        .appointment(appt)
                        .subtotal(fee)
                        .tax(BigDecimal.ZERO)
                        .discount(BigDecimal.ZERO)
                        .total(fee)
                        .status(InvoiceStatus.UNPAID)
                        .build();
                newItems.add(InvoiceItem.builder()
                        .invoice(invoice)
                        .itemType("CONSULTATION")
                        .description(feeLabel + " - Dr. " + docName)
                        .quantity(1)
                        .unitPrice(fee)
                        .totalPrice(fee)
                        .appointmentId(appt.getId())
                        .build());
                // Add one-time registration fee if this patient has never been charged it
                Optional<BigDecimal> regFeeOptN = findRegistrationFee(appt.getHospital().getId());
                if (regFeeOptN.isPresent()
                        && !Boolean.TRUE.equals(appt.getPatient().getRegistrationFeePaid())) {
                    BigDecimal regFee = regFeeOptN.get();
                    newItems.add(InvoiceItem.builder()
                            .invoice(invoice)
                            .itemType("REGISTRATION")
                            .description("Registration Fee")
                            .quantity(1)
                            .unitPrice(regFee)
                            .totalPrice(regFee)
                            .build());
                    invoice.setSubtotal(fee.add(regFee));
                    invoice.setTotal(fee.add(regFee));
                    appt.getPatient().setRegistrationFeePaid(true);
                    patientRepository.save(appt.getPatient());
                }
                invoice.setItems(newItems);
                invoiceRepository.save(invoice);
            } else {
                invoiceRepository.save(Invoice.builder()
                        .invoiceNumber(invoiceNum)
                        .hospital(appt.getHospital())
                        .patient(appt.getPatient())
                        .appointment(appt)
                        .subtotal(BigDecimal.ZERO)
                        .tax(BigDecimal.ZERO)
                        .discount(BigDecimal.ZERO)
                        .total(BigDecimal.ZERO)
                        .status(InvoiceStatus.UNPAID)
                        .notes("OPD Appointment — pending consultation")
                        .build());
            }
        }
    }

    /**
     * Live-estimate sync from the IPD billing modal — the frontend recomputes
     * the grand total every time items/discount/GST change and pushes the new
     * value here so the IPD billing list page shows a fresh "~₹..." estimate
     * without waiting for the user to click Save.
     *
     * The frontend's grandTotal already reflects EVERY item visible in the modal
     * (saved items loaded from the invoice + any newly added items, minus
     * discount, plus medicine GST). Storing it as-is is the correct behaviour —
     * the previous version added committed-item totals on top, which
     * double-counted whatever the modal already showed (a ₹2,500 bill would be
     * persisted as ~₹3,500 etc.).
     *
     * Only `total` is touched. Subtotal/tax/discount stay frozen until the
     * authoritative `finalizeIPD` / `collectAndSave` paths write them.
     */
    @Transactional
    public void updateEstimatedTotal(UUID invoiceId, BigDecimal estimatedTotal) {
        invoiceRepository.findById(invoiceId).ifPresent(invoice -> {
            if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) return;
            BigDecimal safe = estimatedTotal != null ? estimatedTotal : BigDecimal.ZERO;
            invoice.setTotal(safe);
            invoice.setUpdatedAt(LocalDateTime.now());
            invoiceRepository.save(invoice);
        });
    }

    // ── Remove consultation from invoice when appointment is CANCELLED ─────────
    @Transactional
    public void cancelAppointmentInvoice(UUID appointmentId) {
        Optional<Invoice> opt = invoiceRepository.findByAppointment_Id(appointmentId);
        if (opt.isEmpty()) return;
        Invoice invoice = opt.get();
        if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus()) || InvoiceStatus.CANCELLED.equals(invoice.getStatus())) return;
        // If this appointment's invoice was absorbed into an IPD admission (OPD→IPD conversion),
        // do NOT touch it — the IPD invoice lifecycle is managed through the discharge flow.
        // Deleting or stripping items here would break the discharge gate.
        if (invoice.getAdmission() != null) return;
        if (invoice.getItems() != null) {
            invoice.getItems().removeIf(i -> "CONSULTATION".equals(i.getItemType()));
        }
        if (invoice.getItems() == null || invoice.getItems().isEmpty()) {
            invoiceRepository.delete(invoice);
        } else {
            BigDecimal newSubtotal = invoice.getItems().stream()
                    .map(InvoiceItem::getTotalPrice)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            invoice.setSubtotal(newSubtotal);
            invoice.setTotal(newSubtotal
                    .add(invoice.getTax() != null ? invoice.getTax() : BigDecimal.ZERO)
                    .subtract(invoice.getDiscount() != null ? invoice.getDiscount() : BigDecimal.ZERO));
            invoice.setUpdatedAt(LocalDateTime.now());
            invoiceRepository.save(invoice);
        }
    }

    /**
     * Issue a refund against an invoice with end-to-end idempotency. Called by
     * the finance app when a patient is owed money back — typically because a
     * ward return generated a HMS_CREDIT_NOTE that dropped the invoice total
     * below {@code paid_amount}, but the same path works for any overpayment.
     *
     * Idempotency: every call MUST supply {@code clientRequestId}. If an
     * {@code InvoicePayment} with that id already exists we short-circuit and
     * return the existing row instead of double-debiting the bank account.
     *
     * Validation:
     *  - amount must be > 0 and ≤ (paid_amount − net_total) — i.e. cannot
     *    refund more than the actual overpayment.
     *  - non-cash refunds must supply a bank account that belongs to the
     *    invoice's hospital.
     *
     * Returns the refunded {@link InvoicePayment} (negative amount).
     */
    @Transactional
    public InvoicePayment issueRefund(UUID invoiceId,
                                      UUID clientRequestId,
                                      BigDecimal amount,
                                      String paymentMethod,
                                      UUID bankAccountId,
                                      String notes,
                                      User actor) {
        if (clientRequestId == null)
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "clientRequestId is required for refund idempotency");
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0)
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "Refund amount must be positive");
        if (paymentMethod == null || paymentMethod.isBlank())
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "paymentMethod is required");

        // Idempotent replay — return the existing refund row.
        var existing = invoicePaymentRepository.findByClientRequestId(clientRequestId);
        if (existing.isPresent()) return existing.get();

        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new com.zenlocare.clinics.exception.ResourceNotFoundException(
                        "Invoice not found"));

        BigDecimal paid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal total = invoice.getTotal()      != null ? invoice.getTotal()      : BigDecimal.ZERO;
        BigDecimal refundable = paid.subtract(total);
        if (refundable.compareTo(BigDecimal.ZERO) <= 0)
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "Invoice is not overpaid; nothing to refund");
        if (amount.compareTo(refundable) > 0)
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "Refund amount " + amount + " exceeds refundable " + refundable);

        boolean isCash = "Cash".equalsIgnoreCase(paymentMethod) || "CASH".equalsIgnoreCase(paymentMethod);
        if (!isCash && bankAccountId == null)
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "bankAccountId is required for non-cash refunds");

        InvoicePayment refundPayment = InvoicePayment.builder()
                .invoice(invoice)
                .amount(amount.negate())
                .paymentMethod(paymentMethod)
                .bankAccountId(isCash ? null : bankAccountId)
                .collectedBy(userDisplayName(actor))
                .collectedByUser(actor)
                .notes(notes != null ? notes : "Refund for ward-return credit")
                .paidAt(LocalDateTime.now())
                .clientRequestId(clientRequestId)
                .build();
        refundPayment = invoicePaymentRepository.save(refundPayment);

        invoice.setPaidAmount(paid.subtract(amount));
        invoice.setUpdatedAt(LocalDateTime.now());
        invoice.setUpdatedBy(actor);
        invoiceRepository.save(invoice);

        if (!isCash) {
            bankLedgerService.debitPayment(
                    bankAccountId, amount,
                    "Refund — " + invoice.getInvoiceNumber(),
                    invoice.getInvoiceNumber(),
                    invoice.getId());
        }

        return refundPayment;
    }

    @Transactional
    public void refundInvoicePayment(Invoice invoice, BigDecimal amount, String refundMode,
                                     UUID refundBankAccountId, User actor) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Refund amount must be positive.");
        }
        if (refundMode == null || refundMode.isBlank()) {
            throw new IllegalArgumentException("Refund mode is required.");
        }
        BigDecimal paid = invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO;
        if (paid.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Refunds are not allowed when the invoice has no paid amount.");
        }
        if (amount.compareTo(paid) > 0) {
            throw new IllegalArgumentException("Refund amount cannot exceed the paid amount.");
        }

        // Create negative payment record
        InvoicePayment refundPayment = InvoicePayment.builder()
                .invoice(invoice)
                .amount(amount.negate())
                .paymentMethod(refundMode)
                .bankAccountId(refundMode.equalsIgnoreCase("Cash") ? null : refundBankAccountId)
                .collectedBy(userDisplayName(actor))
                .collectedByUser(actor)
                .notes("Refund for appointment cancellation / rescheduling")
                .paidAt(LocalDateTime.now())
                .build();
        invoicePaymentRepository.save(refundPayment);

        // Reduce paid amount
        invoice.setPaidAmount(paid.subtract(amount));
        invoice.setUpdatedAt(LocalDateTime.now());
        invoice.setUpdatedBy(actor);
        invoiceRepository.save(invoice);

        // Bank debit ledger entry (skip for Cash)
        if (!refundMode.equalsIgnoreCase("Cash")) {
            if (refundBankAccountId == null) {
                throw new IllegalArgumentException("refundBankAccountId is required for non-cash refunds.");
            }
            bankLedgerService.debitPayment(
                    refundBankAccountId,
                    amount,
                    "Refund — " + invoice.getInvoiceNumber(),
                    invoice.getInvoiceNumber(),
                    invoice.getId()
            );
        }
    }

    // ── Return the invoice linked to an admission ──────────────────────────────
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Optional<InvoiceDTO> getAdmissionInvoice(UUID admissionId) {
        return invoiceRepository.findAllByAdmission_IdOrderByCreatedAtDesc(admissionId)
                .stream().findFirst().map(this::toDTO);
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Optional<InvoiceDTO> getInvoiceByAppointment(UUID appointmentId) {
        return invoiceRepository.findByAppointment_Id(appointmentId).map(this::toDTO);
    }


    // ── Replace all items on an IPD invoice and recalculate totals ─────────────
    @Transactional
    public InvoiceDTO finalizeIPDInvoice(UUID invoiceId, InvoiceRequest req, User user) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new RuntimeException("Invoice not found"));
        // Reopening a SETTLED bill (new charges added while patient still admitted) — reset to UNSETTLED.
        // Discharge gate enforces that the patient cannot leave until balance is zero again.
        if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) {
            invoice.setStatus(InvoiceStatus.UNSETTLED);
        }
        if (invoice.getItems() != null) {
            invoice.getItems().clear();
        } else {
            invoice.setItems(new ArrayList<>());
        }
        if (req.getItems() != null) {
            req.getItems().forEach(ir -> invoice.getItems().add(InvoiceItem.builder()
                    .invoice(invoice)
                    .serviceId(ir.getServiceId())
                    .radiologyOrderId(ir.getRadiologyOrderId())
                    .appointmentId(ir.getAppointmentId())
                    .ambulanceBookingId(ir.getAmbulanceBookingId())
                    .pharmacyBillId(ir.getPharmacyBillId())
                    .otBookingId(ir.getOtBookingId())
                    .otInvoiceItemId(ir.getOtInvoiceItemId())
                    .itemType(ir.getItemType())
                    .description(ir.getDescription())
                    .quantity(ir.getQuantity())
                    .unitPrice(ir.getUnitPrice())
                    .totalPrice(ir.getTotalPrice())
                    .build()));
        }
        invoice.setSubtotal(req.getSubtotal() != null ? req.getSubtotal() : BigDecimal.ZERO);
        invoice.setTax(req.getTax() != null ? req.getTax() : BigDecimal.ZERO);
        invoice.setDiscount(req.getDiscount() != null ? req.getDiscount() : BigDecimal.ZERO);
        invoice.setAdvanceAdjusted(req.getAdvanceAdjusted() != null ? req.getAdvanceAdjusted() : BigDecimal.ZERO);
        // total = balance due after advance and discount
        invoice.setTotal(req.getTotal() != null ? req.getTotal() : BigDecimal.ZERO);
        if (req.getNotes() != null) invoice.setNotes(req.getNotes());
        invoice.setUpdatedAt(LocalDateTime.now());
        invoice.setUpdatedBy(user);
        Invoice saved = invoiceRepository.save(invoice);

        // Mark advances applied if any were deducted
        if (invoice.getAdmission() != null && invoice.getAdvanceAdjusted().compareTo(BigDecimal.ZERO) > 0) {
            try {
                patientAdvanceService.markAdvancesApplied(
                        invoice.getAdmission().getId(), invoice.getId(), invoice.getAdvanceAdjusted());
            } catch (Exception ignored) {}
        }
        // Mark linked appointments as BILLED. Radiology orders are owned by
        // labs now — labs flips their status itself, HMS leaves them alone.
        saved.getItems().stream()
                .filter(i -> "CONSULTATION".equals(i.getItemType()) && i.getAppointmentId() != null)
                .forEach(i -> appointmentRepository.findById(i.getAppointmentId())
                        .ifPresent(a -> { a.setStatus(Appointment.AppointmentStatus.BILLED); appointmentRepository.save(a); }));
        return toDTO(saved);
    }

    // ── Atomic: update bill items + record payment in one transaction ────────────
    @Transactional
    public InvoiceDTO collectAndSave(UUID invoiceId, InvoiceRequest itemsReq,
                                     BigDecimal amount, String paymentMethod,
                                     UUID bankAccountId, String collectedBy, User user) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new RuntimeException("Invoice not found"));

        // Reset SETTLED → UNSETTLED so new charges can be applied (discharge gate is the real lock)
        if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) {
            invoice.setStatus(InvoiceStatus.UNSETTLED);
        }

        // Replace items
        if (invoice.getItems() != null) invoice.getItems().clear();
        else invoice.setItems(new ArrayList<>());
        if (itemsReq.getItems() != null) {
            itemsReq.getItems().forEach(ir -> invoice.getItems().add(InvoiceItem.builder()
                    .invoice(invoice)
                    .serviceId(ir.getServiceId())
                    .radiologyOrderId(ir.getRadiologyOrderId())
                    .appointmentId(ir.getAppointmentId())
                    .ambulanceBookingId(ir.getAmbulanceBookingId())
                    .pharmacyBillId(ir.getPharmacyBillId())
                    .otBookingId(ir.getOtBookingId())
                    .otInvoiceItemId(ir.getOtInvoiceItemId())
                    .itemType(ir.getItemType())
                    .description(ir.getDescription())
                    .quantity(ir.getQuantity())
                    .unitPrice(ir.getUnitPrice())
                    .totalPrice(ir.getTotalPrice())
                    .build()));
        }
        invoice.setSubtotal(itemsReq.getSubtotal() != null ? itemsReq.getSubtotal() : BigDecimal.ZERO);
        invoice.setTax(itemsReq.getTax() != null ? itemsReq.getTax() : BigDecimal.ZERO);
        invoice.setDiscount(itemsReq.getDiscount() != null ? itemsReq.getDiscount() : BigDecimal.ZERO);
        invoice.setAdvanceAdjusted(itemsReq.getAdvanceAdjusted() != null ? itemsReq.getAdvanceAdjusted() : BigDecimal.ZERO);
        invoice.setTotal(itemsReq.getTotal() != null ? itemsReq.getTotal() : BigDecimal.ZERO);
        if (itemsReq.getNotes() != null) invoice.setNotes(itemsReq.getNotes());

        // Record payment
        InvoicePayment payment = InvoicePayment.builder()
                .invoice(invoice)
                .amount(amount)
                .paymentMethod(paymentMethod)
                .bankAccountId(bankAccountId)
                .collectedBy(collectedBy)
                .build();
        payment.setCollectedByUser(user);
        invoicePaymentRepository.save(payment);

        BigDecimal newPaid = (invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO).add(amount);
        invoice.setPaidAmount(newPaid);
        invoice.setUpdatedAt(LocalDateTime.now());
        invoice.setUpdatedBy(user);

        BigDecimal advance = invoice.getAdvanceAdjusted() != null ? invoice.getAdvanceAdjusted() : BigDecimal.ZERO;
        BigDecimal total = invoice.getTotal() != null ? invoice.getTotal() : BigDecimal.ZERO;
        boolean fullyPaid = newPaid.add(advance).compareTo(total) >= 0;
        // collectAndSave is exclusively called for IPD invoices — always use SETTLED/UNSETTLED
        invoice.setStatus(fullyPaid ? InvoiceStatus.SETTLED : InvoiceStatus.UNSETTLED);

        if (fullyPaid && invoice.getAdmission() != null && advance.compareTo(BigDecimal.ZERO) > 0) {
            try {
                patientAdvanceService.markAdvancesApplied(invoice.getAdmission().getId(), invoice.getId(), advance);
            } catch (Exception e) {
                log.error("markAdvancesApplied failed in collectAndSave for invoice {} admission {} (advance ₹{}): {}",
                        invoice.getId(), invoice.getAdmission().getId(), advance, e.getMessage(), e);
            }
        }

        if (bankAccountId != null) {
            try { bankLedgerService.creditPayment(bankAccountId, amount,
                    "Payment — " + invoice.getInvoiceNumber(), invoice.getInvoiceNumber(), invoice.getId());
            } catch (Exception e) {
                log.error("Bank ledger credit failed in collectAndSave for invoice {} amount ₹{} on account {}: {}",
                        invoice.getId(), amount, bankAccountId, e.getMessage(), e);
            }
        }

        Invoice saved = invoiceRepository.save(invoice);

        // Mark consultations as BILLED. Radiology orders are owned by labs;
        // labs flips their status from its own report-generation flow.
        saved.getItems().stream()
                .filter(i -> "CONSULTATION".equals(i.getItemType()) && i.getAppointmentId() != null)
                .forEach(i -> appointmentRepository.findById(i.getAppointmentId())
                        .ifPresent(a -> { a.setStatus(Appointment.AppointmentStatus.BILLED); appointmentRepository.save(a); }));

        return toDTO(saved);
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public InvoiceDTO getInvoiceDetail(UUID id) {
        Invoice invoice = invoiceRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Invoice not found"));
        return toDTO(invoice);
    }

    @Transactional
    public InvoiceDTO applyWaiver(UUID invoiceId, UUID itemId, java.math.BigDecimal waiverAmount, String waiverReason, User user) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new RuntimeException("Invoice not found"));
        if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) {
            throw new RuntimeException("Cannot modify a paid invoice");
        }
        InvoiceItem target = invoice.getItems().stream()
                .filter(i -> i.getId().equals(itemId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Invoice item not found"));

        java.math.BigDecimal safe = waiverAmount
                .max(java.math.BigDecimal.ZERO)
                .min(target.getTotalPrice());
        target.setWaiverAmount(safe);
        target.setWaiverReason(waiverReason);

        java.math.BigDecimal totalWaiver = invoice.getItems().stream()
                .map(i -> i.getWaiverAmount() != null ? i.getWaiverAmount() : java.math.BigDecimal.ZERO)
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);

        invoice.setDiscount(totalWaiver);
        invoice.setTotal(invoice.getSubtotal().add(invoice.getTax()).subtract(totalWaiver));
        invoice.setUpdatedAt(LocalDateTime.now());
        invoice.setUpdatedBy(user);

        invoiceRepository.save(invoice);
        return toDTO(invoice);
    }

    // Look up the hospital's active one-time REGISTRATION patient service price.
    // Returns empty if not configured — registration fee is skipped in that case.
    private Optional<BigDecimal> findRegistrationFee(UUID hospitalId) {
        return patientServiceRepository.findByHospitalId(hospitalId).stream()
                .filter(s -> com.zenlocare.clinics.entity.PatientService.ServiceType.REGISTRATION == s.getType()
                          && Boolean.TRUE.equals(s.getOneTimeCharge())
                          && Boolean.TRUE.equals(s.getIsActive()))
                .map(com.zenlocare.clinics.entity.PatientService::getPricePerDay)
                .filter(p -> p != null && p.compareTo(BigDecimal.ZERO) > 0)
                .findFirst();
    }

    private InvoiceDTO toDTO(Invoice inv) {
        List<InvoicePayment> payments = (inv.getId() != null)
            ? invoicePaymentRepository.findByInvoice_IdOrderByPaidAtAsc(inv.getId())
            : List.of();
        return toDTO(inv, payments);
    }

    // Page-listing variant — caller has already batch-fetched payments for the whole
    // page (one IN query) and groups them by invoice id, so this avoids the
    // one-query-per-invoice round trip that toDTO(Invoice) does on its own.
    private InvoiceDTO toDTO(Invoice inv, List<InvoicePayment> payments) {
        String bookedBy = "System";
        String doctorName = null;
        LocalDateTime apptDateTime = null;
        String apptType = null;
        Integer tokenNum = null;
        String apptStatus = null;
        String chiefComplaint = null;
        String cancelledReason = null;

        if (inv.getAppointment() != null) {
            log.debug("toDTO invoice={} appointment={} createdBy={}",
                inv.getInvoiceNumber(),
                inv.getAppointment().getId(),
                inv.getAppointment().getCreatedBy());
            if (inv.getAppointment().getCreatedBy() != null) {
                String fName = inv.getAppointment().getCreatedBy().getFirstName();
                String lName = inv.getAppointment().getCreatedBy().getLastName();
                log.debug("toDTO createdBy firstName={} lastName={}", fName, lName);
                bookedBy = (fName + " " + (lName != null ? lName : "")).trim();
            }
            if (inv.getAppointment().getDoctor() != null && inv.getAppointment().getDoctor().getUser() != null) {
                doctorName = inv.getAppointment().getDoctor().getUser().getFirstName() + " " + inv.getAppointment().getDoctor().getUser().getLastName();
            }
            if (inv.getAppointment().getApptDate() != null && inv.getAppointment().getApptTime() != null) {
                apptDateTime = LocalDateTime.of(inv.getAppointment().getApptDate(), inv.getAppointment().getApptTime());
            }
            apptType = inv.getAppointment().getType() != null ? String.valueOf(inv.getAppointment().getType()) : null;
            tokenNum = inv.getAppointment().getTokenNumber();
            apptStatus = inv.getAppointment().getStatus() != null ? String.valueOf(inv.getAppointment().getStatus()) : null;
            chiefComplaint = inv.getAppointment().getChiefComplaint();
            cancelledReason = inv.getAppointment().getCancelledReason();
        } else {
            log.debug("toDTO invoice={} has NO appointment", inv.getInvoiceNumber());
        }
        log.debug("toDTO final bookedBy={}", bookedBy);

        List<InvoiceDTO.ItemDTO> itemsList = new ArrayList<>();
        if (inv.getItems() != null) {
            itemsList = inv.getItems().stream().map(item ->
                    new InvoiceDTO.ItemDTO(
                            item.getId(),
                            item.getItemType(),
                            item.getDescription(),
                            item.getQuantity(),
                            item.getUnitPrice(),
                            item.getTotalPrice(),
                            item.getWaiverAmount(),
                            item.getWaiverReason(),
                            item.getServiceId(),
                            item.getRadiologyOrderId(),
                            item.getAppointmentId(),
                            item.getAmbulanceBookingId(),
                            item.getPharmacyBillId(),
                            item.getOtBookingId(),
                            item.getOtInvoiceItemId()
                    )).collect(Collectors.toList());
        }
        InvoiceDTO.InvoiceDTOBuilder b = InvoiceDTO.builder();
        b.id(inv.getId().toString());
        b.invoiceNumber(inv.getInvoiceNumber());
        
        if (inv.getPatient() != null) {
            b.patientId(inv.getPatient().getId());
            b.patientName(inv.getPatient().getFirstName() + " " + inv.getPatient().getLastName());
            b.patientUhid(inv.getPatient().getUhid());
        }
        
        if (inv.getAdmission() != null) {
            b.admissionId(inv.getAdmission().getId());
            b.admissionNumber(inv.getAdmission().getAdmissionNumber());
        }
        
        if (inv.getAppointment() != null) {
            b.appointmentId(inv.getAppointment().getId());
        }
        
        b.appointmentDate(apptDateTime);
        b.appointmentDoctorName(doctorName);
        b.bookedBy(bookedBy);
        b.appointmentType(apptType);
        b.appointmentTokenNumber(tokenNum);
        b.appointmentStatus(apptStatus);
        b.appointmentChiefComplaint(chiefComplaint);
        b.appointmentCancelledReason(cancelledReason);
        
        b.subtotal(inv.getSubtotal());
        b.tax(inv.getTax());
        b.discount(inv.getDiscount());
        b.total(inv.getTotal());
        b.paymentMethod(inv.getPaymentMethod());
        b.notes(inv.getNotes());
        
        if (inv.getStatus() != null) {
            b.status(String.valueOf(inv.getStatus()));
        }
        
        b.advanceAdjusted(inv.getAdvanceAdjusted());
        b.paidAmount(inv.getPaidAmount());
        b.createdAt(inv.getCreatedAt());
        b.updatedAt(inv.getUpdatedAt());
        if (inv.getUpdatedBy() != null) {
            b.updatedById(inv.getUpdatedBy().getId());
            b.updatedByName(userDisplayName(inv.getUpdatedBy()));
        }
        b.items(itemsList);

        List<InvoiceDTO.PaymentDTO> pList = payments.stream().map(p -> new InvoiceDTO.PaymentDTO(
                p.getId(), p.getAmount(), p.getPaymentMethod(), p.getCollectedBy(),
                p.getCollectedByUser() != null ? p.getCollectedByUser().getId() : null,
                userDisplayName(p.getCollectedByUser()),
                p.getPaidAt()
        )).collect(Collectors.toList());
        b.payments(pList);
        
        return b.build();
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Map<String, Object> getPaginatedOpdInvoices(
        UUID hospitalId, int page, int size, String status, String search
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        String safeSearch = (search == null) ? "" : search.trim();
        String safeStatus = (status == null || status.isBlank()) ? "ALL" : status.trim().toUpperCase();

        List<InvoiceStatus> statuses = resolveOpdStatuses(safeStatus);
        Page<Invoice> result = (statuses == null)
            ? invoiceRepository.searchOpdInvoices(hospitalId, safeSearch, pageable)
            : invoiceRepository.searchOpdInvoicesByStatuses(hospitalId, statuses, safeSearch, pageable);

        return buildPageResponse(result);
    }

    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Map<String, Object> getPaginatedIpdInvoices(
        UUID hospitalId, int page, int size, String status, String search
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        String safeSearch = (search == null) ? "" : search.trim();
        String safeStatus = (status == null || status.isBlank()) ? "ALL" : status.trim().toUpperCase();

        List<InvoiceStatus> statuses = resolveIpdStatuses(safeStatus);
        Page<Invoice> result = (statuses == null)
            ? invoiceRepository.searchIpdInvoices(hospitalId, safeSearch, pageable)
            : invoiceRepository.searchIpdInvoicesByStatuses(hospitalId, statuses, safeSearch, pageable);

        return buildPageResponse(result);
    }

    /**
     * Resolves an OPD filter token to the concrete InvoiceStatus enums to match,
     * or null when no status filter should be applied (ALL / unknown token).
     *
     * The OPD billing tab exposes two grouped buckets — PAID (= PAID or SETTLED)
     * and UNPAID (= UNPAID, PARTIAL or UNSETTLED) — so partially-collected and
     * legacy SETTLED/UNSETTLED rows still surface under the right tab.
     * CANCELLED rows are intentionally excluded from both buckets; they only
     * appear under ALL.
     */
    private List<InvoiceStatus> resolveOpdStatuses(String token) {
        if ("ALL".equals(token)) return null;
        switch (token) {
            case "PAID":
                return List.of(InvoiceStatus.PAID, InvoiceStatus.SETTLED);
            case "UNPAID":
                return List.of(InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.UNSETTLED);
            default:
                try {
                    return List.of(InvoiceStatus.valueOf(token));
                } catch (IllegalArgumentException ignored) {
                    return null;
                }
        }
    }

    /**
     * Resolves an IPD filter token to enums. The IPD billing tab exposes two
     * grouped buckets — SETTLED (= PAID or SETTLED) and UNSETTLED (= UNPAID,
     * PARTIAL or UNSETTLED) — so the token may not map 1:1 to an enum.
     */
    private List<InvoiceStatus> resolveIpdStatuses(String token) {
        if ("ALL".equals(token)) return null;
        switch (token) {
            case "SETTLED":
                return List.of(InvoiceStatus.PAID, InvoiceStatus.SETTLED);
            case "UNSETTLED":
                return List.of(InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.UNSETTLED);
            default:
                try {
                    return List.of(InvoiceStatus.valueOf(token));
                } catch (IllegalArgumentException ignored) {
                    return null;
                }
        }
    }

    private Map<String, Object> buildPageResponse(Page<Invoice> result) {
        Map<String, Object> response = new HashMap<>();

        List<Invoice> invoices = result.getContent();
        List<UUID> invoiceIds = invoices.stream().map(Invoice::getId).collect(Collectors.toList());
        Map<UUID, List<InvoicePayment>> paymentsByInvoiceId = invoiceIds.isEmpty()
            ? Map.of()
            : invoicePaymentRepository.findByInvoice_IdInOrderByPaidAtAsc(invoiceIds).stream()
                .collect(Collectors.groupingBy(p -> p.getInvoice().getId()));

        List<InvoiceDTO> dtos = invoices.stream()
                .map(inv -> toDTO(inv, paymentsByInvoiceId.getOrDefault(inv.getId(), List.of())))
                .collect(Collectors.toList());
        response.put("invoices", dtos);
        response.put("totalElements", result.getTotalElements());
        response.put("totalPages", result.getTotalPages());
        response.put("currentPage", result.getNumber());
        return response;
    }

    /**
     * Auto-adds an ambulance charge as a line item to the patient's active IPD invoice
     * when the booking is marked COMPLETED with reachedToSameHospital = true.
     * Idempotent: no-op if the booking is already present in the invoice.
     */
    /**
     * Auto-merges all eligible ambulance bookings for a patient into the IPD invoice
     * for the given admission. Called from AdmissionService.admit right after the
     * IPD invoice is created/promoted.
     *
     * "Eligible" means: same hospital, same patient, reached_to_same_hospital=TRUE,
     * not yet merged (mergedToIpd != true), not CANCELLED. The booking's
     * `mergedToIpd` flag is the idempotency lock — re-running this method on the
     * same admission is a no-op once all bookings are merged.
     *
     * Each merge:
     *   - Adds an AMBULANCE line item to the IPD invoice (via the existing
     *     addAmbulanceItemToIpdInvoice helper which has its own idempotency check)
     *   - Sets mergedToIpd=TRUE on the booking so it won't be picked again
     *
     * Failures on individual bookings are logged and swallowed — one bad booking
     * must not prevent the admission from completing or block subsequent merges.
     */
    @Transactional
    public void autoMergeSameHospitalAmbulancesIntoIpd(UUID admissionId) {
        Admission admission = admissionRepository.findById(admissionId).orElse(null);
        if (admission == null || admission.getHospital() == null || admission.getPatient() == null) return;

        UUID hospitalId = admission.getHospital().getId();
        Integer patientId = admission.getPatient().getId();

        List<AmbulanceBooking> eligible = ambulanceBookingRepository.findEligibleForIpdMerge(hospitalId, patientId);
        if (eligible.isEmpty()) {
            log.info("Ambulance→IPD merge: no eligible bookings for admission {} (patient {} at hospital {})",
                    admissionId, patientId, hospitalId);
            return;
        }

        int merged = 0;
        for (AmbulanceBooking booking : eligible) {
            try {
                java.math.BigDecimal charge = booking.getCharge();
                if (charge == null || charge.signum() <= 0) {
                    log.info("Ambulance→IPD merge: booking {} has no charge — marking merged without billing", booking.getId());
                    booking.setMergedToIpd(true);
                    ambulanceBookingRepository.save(booking);
                    continue;
                }
                String vehicleDesc = booking.getVehicle() != null ? booking.getVehicle().getVehicleNumber() : booking.getVehicleNumber();
                String typeDesc    = booking.getAmbulanceType() != null ? booking.getAmbulanceType().getName() : "Ambulance";
                String description = typeDesc + (vehicleDesc != null ? " (" + vehicleDesc + ")" : "");

                boolean added = addAmbulanceItemToIpdInvoice(patientId, booking.getId(), charge, description);
                if (added) {
                    booking.setMergedToIpd(true);
                    ambulanceBookingRepository.save(booking);
                    merged++;
                } else {
                    // Should not happen since we just created the IPD invoice in createAdmissionInvoice,
                    // but log it loudly if it ever does — silent skip caused the original bug.
                    log.warn("Ambulance→IPD merge: addAmbulanceItemToIpdInvoice returned false for booking {} (admission {}) — patient has no active IPD invoice. Booking NOT marked merged.",
                            booking.getId(), admissionId);
                }
            } catch (Exception e) {
                log.error("Ambulance→IPD merge: failed to merge booking {} into admission {}'s IPD invoice — skipping. {}",
                        booking.getId(), admissionId, e.getMessage(), e);
            }
        }
        log.info("Ambulance→IPD merge: merged {} of {} eligible booking(s) into admission {}",
                merged, eligible.size(), admissionId);
    }

    /**
     * Adds an AMBULANCE line item to the patient's active IPD invoice, idempotently.
     *
     * @return true  — the item was added (or was already present from a prior call);
     *                callers can safely set booking.mergedToIpd = TRUE
     *         false — patient has no active IPD invoice yet, so no merge happened;
     *                callers must NOT mark the booking as merged or the admit-time
     *                auto-merge will skip it later.
     */
    @Transactional
    public boolean addAmbulanceItemToIpdInvoice(Integer patientId, Long bookingId,
                                                 java.math.BigDecimal charge, String description) {
        if (patientId == null || charge == null) return false;

        // Find the most recent IPD (admission-linked) invoice for this patient
        Invoice invoice = invoiceRepository.findByPatientIdOrderByCreatedAtDesc(patientId)
                .stream()
                .filter(i -> i.getAdmission() != null)
                .filter(i -> !InvoiceStatus.CANCELLED.equals(i.getStatus()))
                .findFirst()
                .orElse(null);

        if (invoice == null) return false; // Patient has no active IPD invoice — caller should NOT mark merged

        // Idempotency: already added → still considered merged successfully
        boolean alreadyPresent = invoice.getItems() != null && invoice.getItems().stream()
                .anyMatch(it -> bookingId.equals(it.getAmbulanceBookingId()));
        if (alreadyPresent) return true;

        if (invoice.getItems() == null) invoice.setItems(new java.util.ArrayList<>());

        InvoiceItem item = InvoiceItem.builder()
                .invoice(invoice)
                .itemType("AMBULANCE")
                .ambulanceBookingId(bookingId)
                .description(description != null ? description : "Ambulance Service")
                .quantity(1)
                .unitPrice(charge)
                .totalPrice(charge)
                .build();
        invoice.getItems().add(item);

        // Recalculate subtotal and balance due
        java.math.BigDecimal subtotal = invoice.getItems().stream()
                .map(it -> it.getTotalPrice() != null ? it.getTotalPrice() : java.math.BigDecimal.ZERO)
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
        invoice.setSubtotal(subtotal);

        java.math.BigDecimal tax      = invoice.getTax()            != null ? invoice.getTax()            : java.math.BigDecimal.ZERO;
        java.math.BigDecimal discount = invoice.getDiscount()       != null ? invoice.getDiscount()       : java.math.BigDecimal.ZERO;
        java.math.BigDecimal advance  = invoice.getAdvanceAdjusted()!= null ? invoice.getAdvanceAdjusted(): java.math.BigDecimal.ZERO;
        java.math.BigDecimal paid     = invoice.getPaidAmount()     != null ? invoice.getPaidAmount()     : java.math.BigDecimal.ZERO;
        invoice.setTotal(subtotal.add(tax).subtract(discount).subtract(advance).subtract(paid));

        // Re-open the invoice if it was fully settled so staff can see the new item
        if (InvoiceStatus.PAID.equals(invoice.getStatus()) || InvoiceStatus.SETTLED.equals(invoice.getStatus())) {
            invoice.setStatus(InvoiceStatus.UNSETTLED);
        }

        invoice.setUpdatedAt(LocalDateTime.now());
        invoiceRepository.save(invoice);
        return true;
    }


    private boolean isCollectible(Invoice inv) {
        InvoiceStatus s = inv.getStatus();
        return s != null
                && !InvoiceStatus.PAID.equals(s)
                && !InvoiceStatus.SETTLED.equals(s)
                && !InvoiceStatus.CANCELLED.equals(s);
    }

    /**
     * An OPD invoice is mergeable into an IPD admission if it is still
     * collectible AND has no payments yet — merging a partially paid invoice
     * would carry the line items forward without the payment record, causing
     * the patient to be re-billed. Such cases must be settled separately.
     */
    private boolean isMergeable(Invoice inv) {
        if (!isCollectible(inv)) return false;
        BigDecimal paid = inv.getPaidAmount() != null ? inv.getPaidAmount() : BigDecimal.ZERO;
        return paid.compareTo(BigDecimal.ZERO) == 0;
    }

    /**
     * Picks the OPD invoice to merge into a new IPD admission, or null if none.
     *
     * Trigger 1 — explicit sourceAppointmentId (admit-from-appointment-row):
     *   look up by appointment_id; merge if mergeable, otherwise skip with log.
     *   We do NOT fall back to patient lookup when the explicit appointment is
     *   present but not mergeable — the caller knew exactly which OPD they meant.
     *
     * Trigger 2 — admissionType=OPD_REFERRAL (admit-from-admissions):
     *   look up the patient's most recent open OPD invoice. Only the latest one
     *   is considered — older un-merged OPDs are likely unrelated past visits
     *   that should be settled separately, not silently rolled into this admission.
     */
    private Invoice pickOpdInvoiceToMerge(Admission admission, UUID hospitalId,
                                          Integer patientId, UUID sourceAppointmentId) {
        if (sourceAppointmentId != null) {
            Optional<Invoice> opdOpt = invoiceRepository.findByAppointment_Id(sourceAppointmentId);
            if (opdOpt.isEmpty()) {
                log.warn("OPD→IPD merge: no invoice found for source appointment {}", sourceAppointmentId);
                return null;
            }
            Invoice cand = opdOpt.get();
            if (isMergeable(cand)) return cand;
            log.info("OPD→IPD merge skipped: appt {}'s invoice {} not mergeable (status={}, paid={})",
                    sourceAppointmentId, cand.getId(), cand.getStatus(),
                    cand.getPaidAmount() != null ? cand.getPaidAmount() : "0");
            return null;
        }

        if (admission.getAdmissionType() == AdmissionType.OPD_REFERRAL) {
            List<Invoice> candidates = invoiceRepository.findOpenOpdInvoicesForPatient(hospitalId, patientId);
            if (candidates.isEmpty()) {
                log.info("OPD→IPD merge: OPD_REFERRAL admission {} but no open OPD invoices for patient {}",
                        admission.getId(), patientId);
                return null;
            }
            Invoice latest = candidates.get(0); // query orders by createdAt DESC
            if (isMergeable(latest)) {
                log.info("OPD→IPD merge: OPD_REFERRAL fallback selected latest OPD invoice {} for patient {} (of {} candidates)",
                        latest.getId(), patientId, candidates.size());
                return latest;
            }
            log.info("OPD→IPD merge: latest OPD invoice {} for patient {} not mergeable (status={}, paid={})",
                    latest.getId(), patientId, latest.getStatus(),
                    latest.getPaidAmount() != null ? latest.getPaidAmount() : "0");
        }

        return null;
    }

    /**
     * Promotes an OPD invoice into the IPD invoice for this admission:
     * sets admission FK, rewrites the invoice number to IPD format, appends an
     * audit note, and saves with @Version optimistic locking. Throws
     * ObjectOptimisticLockingFailureException on concurrent mutation.
     */
    private void promoteOpdInvoiceToIpd(Invoice opd, Admission admission, Hospital hospital,
                                        String admissionNumber) {
        opd.setAdmission(admission);
        opd.setInvoiceNumber(HospitalIdPrefix.of(hospital) + "IPD-"
                + HospitalIdPrefix.stripHospitalPrefix(admissionNumber));
        opd.setNotes("IPD Admission (converted from OPD) — " + admissionNumber);
        opd.setUpdatedAt(LocalDateTime.now());
        try {
            invoiceRepository.saveAndFlush(opd);
        } catch (org.springframework.orm.ObjectOptimisticLockingFailureException e) {
            log.warn("OPD→IPD merge: optimistic lock on invoice {} during admission {}",
                    opd.getId(), admission.getId());
            throw e;
        }
        log.info("OPD→IPD merge: invoice {} promoted to IPD for admission {}",
                opd.getId(), admission.getId());
    }
}
