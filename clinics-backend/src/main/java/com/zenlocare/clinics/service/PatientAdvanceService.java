package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class PatientAdvanceService {

    private final PatientAdvanceRepository patientAdvanceRepository;
    private final PatientRepository patientRepository;
    private final HospitalRepository hospitalRepository;
    private final AdmissionRepository admissionRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BankTransactionRepository bankTransactionRepository;

    // Called from PatientService when patient is registered and advance is collected
    @Transactional
    public PatientAdvance createRegistrationAdvance(Integer patientId, UUID hospitalId,
                                                     BigDecimal amount, String paymentMethod, String notes) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> new RuntimeException("Patient not found"));
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new RuntimeException("Hospital not found"));

        String receiptNumber = generateReceiptNumber(patient);
        PatientAdvance advance = PatientAdvance.builder()
                .hospital(hospital)
                .patient(patient)
                .amount(amount)
                .paymentMethod(paymentMethod)
                .source(PatientAdvanceSource.REGISTRATION)
                .notes(notes)
                .receiptNumber(receiptNumber)
                .build();
        return patientAdvanceRepository.save(advance);
    }

    // Called from BillingController when admission advance is collected at Step 4
    @Transactional
    public PatientAdvance createAdmissionAdvance(UUID admissionId, BigDecimal amount,
                                                  String paymentMethod, UUID bankAccountId,
                                                  String notes, String collectedBy) {
        Admission admission = admissionRepository.findById(admissionId)
                .orElseThrow(() -> new RuntimeException("Admission not found"));
        Patient patient = admission.getPatient();

        String receiptNumber = generateReceiptNumber(patient);
        PatientAdvance advance = PatientAdvance.builder()
                .hospital(admission.getHospital())
                .patient(patient)
                .admission(admission)
                .amount(amount)
                .paymentMethod(paymentMethod)
                .bankAccountId(bankAccountId)
                .source(PatientAdvanceSource.ADMISSION)
                .notes(notes)
                .receiptNumber(receiptNumber)
                .collectedBy(collectedBy)
                .build();
        PatientAdvance saved = patientAdvanceRepository.save(advance);

        if (bankAccountId != null && amount != null && amount.compareTo(BigDecimal.ZERO) > 0) {
            creditBankAccount(bankAccountId, amount,
                    "Advance — " + receiptNumber, admission.getHospital().getId());
        }
        return saved;
    }

    // Auto-link any floating registration advances to this admission when patient is admitted
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void linkRegistrationAdvancesToAdmission(Integer patientId, UUID admissionId) {
        Admission admission = admissionRepository.findById(admissionId).orElse(null);
        if (admission == null) return;
        List<PatientAdvance> floating = patientAdvanceRepository
                .findByPatient_IdAndAdmission_IdIsNullAndAppliedFalse(patientId);
        floating.forEach(a -> {
            a.setAdmission(admission);
            patientAdvanceRepository.save(a);
        });
    }

    public List<PatientAdvance> listByAdmission(UUID admissionId) {
        return patientAdvanceRepository.findByAdmission_Id(admissionId);
    }

    public List<PatientAdvance> listByPatient(Integer patientId) {
        return patientAdvanceRepository.findByPatient_Id(patientId);
    }

    public BigDecimal totalByAdmission(UUID admissionId) {
        return patientAdvanceRepository.findByAdmission_Id(admissionId).stream()
                .map(a -> a.getAmount() != null ? a.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * Mark patient advances as applied to a finalized invoice. Called from
     * InvoiceService.collectPayment / collectAndSave whenever a payment fully
     * settles an IPD invoice that had an advance adjustment.
     *
     * Old version had two correctness bugs:
     *   1. Used `adv.getAmount()` (the original advance amount) instead of the
     *      remaining balance, so two invoices drawing on the same advance would
     *      each see the full advance available — silently losing the first
     *      invoice's claim when the second wrote over `appliedAmount`.
     *   2. No idempotency on the same-invoice-twice case (e.g. a network retry
     *      from the UI). A second call would re-walk the unapplied advances and
     *      overwrite the bookkeeping with the same numbers — usually harmless
     *      on identical args but masking a logic bug if amounts ever differed.
     *
     * New version:
     *   - Computes available = amount - already-applied. Skips fully-consumed
     *     advances (defensive — query already filters applied=true).
     *   - Skips advances whose appliedInvoiceId already points at THIS invoice
     *     — they're "this invoice's share already booked." Same-invoice retry
     *     is now a no-op.
     *   - Accumulates appliedAmount across multiple invoices instead of
     *     overwriting, so partial applications are tracked correctly.
     *   - Sets applied=true only when an advance is fully consumed.
     *
     * REQUIRES_NEW so any failure here can't poison the caller's transaction.
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void markAdvancesApplied(UUID admissionId, UUID invoiceId, BigDecimal appliedTotal) {
        if (appliedTotal == null || appliedTotal.compareTo(BigDecimal.ZERO) <= 0) return;

        List<PatientAdvance> advances = patientAdvanceRepository.findByAdmission_IdAndAppliedFalse(admissionId);
        BigDecimal remaining = appliedTotal;

        for (PatientAdvance adv : advances) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;

            // Idempotency — if this advance was last booked against the same
            // invoice, don't touch it. Re-invocations of markAdvancesApplied
            // (e.g. a retry after a network blip) become safe no-ops.
            if (invoiceId.equals(adv.getAppliedInvoiceId())) continue;

            BigDecimal advAmount     = adv.getAmount()        != null ? adv.getAmount()        : BigDecimal.ZERO;
            BigDecimal alreadyUsed   = adv.getAppliedAmount() != null ? adv.getAppliedAmount() : BigDecimal.ZERO;
            BigDecimal available     = advAmount.subtract(alreadyUsed);
            if (available.compareTo(BigDecimal.ZERO) <= 0) continue;

            BigDecimal use = remaining.min(available);
            adv.setAppliedAmount(alreadyUsed.add(use));
            adv.setAppliedInvoiceId(invoiceId);
            adv.setApplied(adv.getAppliedAmount().compareTo(advAmount) >= 0);
            patientAdvanceRepository.save(adv);
            remaining = remaining.subtract(use);
        }
    }

    public PatientAdvanceDTO toDTO(PatientAdvance a) {
        return PatientAdvanceDTO.builder()
                .id(a.getId().toString())
                .amount(a.getAmount())
                .paymentMethod(a.getPaymentMethod())
                .source(a.getSource().name())
                .receiptNumber(a.getReceiptNumber())
                .notes(a.getNotes())
                .applied(a.getApplied())
                .appliedAmount(a.getAppliedAmount())
                .collectedBy(a.getCollectedBy())
                .createdAt(a.getCreatedAt())
                .build();
    }

    private String generateReceiptNumber(Patient patient) {
        long seq = patientAdvanceRepository.countByPatient_Id(patient.getId()) + 1;
        // Strip embedded hospital prefix from UHID so the receipt has the hospital code
        // at the START exactly once: "1001-ADV-{14digits}-001"
        return HospitalIdPrefix.of(patient.getHospital())
                + "ADV-"
                + HospitalIdPrefix.stripHospitalPrefix(patient.getUhid())
                + "-" + String.format("%03d", seq);
    }

    private void creditBankAccount(UUID bankAccountId, BigDecimal amount, String description, UUID hospitalId) {
        bankAccountRepository.findById(bankAccountId).ifPresent(account -> {
            bankTransactionRepository.save(BankTransaction.builder()
                    .hospitalId(hospitalId)
                    .bankAccountId(bankAccountId)
                    .amount(amount)
                    .type("CREDIT")
                    .description(description)
                    .transactionDate(LocalDateTime.now())
                    .build());
        });
    }

    // DTO returned by API
    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class PatientAdvanceDTO {
        private String id;
        private java.math.BigDecimal amount;
        private String paymentMethod;
        private String source;
        private String receiptNumber;
        private String notes;
        private Boolean applied;
        private java.math.BigDecimal appliedAmount;
        private String collectedBy;
        private java.time.LocalDateTime createdAt;
    }
}
