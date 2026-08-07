package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.BankTransaction;
import com.zenlocare.clinics.repository.BankAccountRepository;
import com.zenlocare.clinics.repository.BankTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Isolated bank ledger writes — always in their own transaction (REQUIRES_NEW)
 * so a schema mismatch or constraint failure never poisons the caller's transaction.
 */
@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class BankLedgerService {

    private final BankAccountRepository bankAccountRepository;
    private final BankTransactionRepository bankTransactionRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void creditPayment(UUID bankAccountId, BigDecimal amount,
                              String description, String referenceNo, UUID relatedEntityId) {
        creditRow(bankAccountId, amount, description, referenceNo, relatedEntityId);
    }

    /**
     * Same CREDIT write, but with default REQUIRED propagation so it JOINS the
     * caller's transaction and commits/rolls back with it. Used by the claim
     * settlement path, where a swallowed ledger failure would leave a settled
     * invoice with no matching bank credit (see BankLedgerService's REQUIRES_NEW
     * sibling above and the collectPayment {@code atomicLedger} branch). Any
     * failure here must propagate — do NOT wrap this call in a log-only catch.
     */
    @Transactional
    public void creditPaymentRequired(UUID bankAccountId, BigDecimal amount,
                                      String description, String referenceNo, UUID relatedEntityId) {
        creditRow(bankAccountId, amount, description, referenceNo, relatedEntityId);
    }

    /** Shared row write; runs in whichever transaction the public entry point opened. */
    private void creditRow(UUID bankAccountId, BigDecimal amount,
                           String description, String referenceNo, UUID relatedEntityId) {
        bankAccountRepository.findById(bankAccountId).ifPresent(account ->
            bankTransactionRepository.save(BankTransaction.builder()
                    .hospitalId(account.getHospitalId())
                    .bankAccountId(bankAccountId)
                    .amount(amount)
                    .type("CREDIT")
                    .description(description)
                    .referenceNo(referenceNo)
                    .relatedEntityId(relatedEntityId)
                    .relatedEntityType("INVOICE")
                    .transactionDate(LocalDateTime.now())
                    .build()));
    }

    @Transactional
    public void debitPayment(UUID bankAccountId, BigDecimal amount,
                              String description, String referenceNo, UUID relatedEntityId) {
        bankAccountRepository.findById(bankAccountId).ifPresent(account ->
            bankTransactionRepository.save(BankTransaction.builder()
                    .hospitalId(account.getHospitalId())
                    .bankAccountId(bankAccountId)
                    .amount(amount)
                    .type("DEBIT")
                    .description(description)
                    .referenceNo(referenceNo)
                    .relatedEntityId(relatedEntityId)
                    .relatedEntityType("INVOICE")
                    .transactionDate(LocalDateTime.now())
                    .build()));
    }
}
