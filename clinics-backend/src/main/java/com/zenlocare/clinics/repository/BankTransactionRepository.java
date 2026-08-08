package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BankTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public interface BankTransactionRepository extends JpaRepository<BankTransaction, UUID> {

    List<BankTransaction> findByBankAccountIdOrderByTransactionDateDesc(UUID bankAccountId);

    /** Guards deletion: an account with ledger history must never be removed. */
    boolean existsByBankAccountId(UUID bankAccountId);

    @Query("SELECT COALESCE(SUM(CASE WHEN t.type = 'CREDIT' THEN t.amount ELSE -t.amount END), 0) " +
           "FROM BankTransaction t WHERE t.bankAccountId = :accountId")
    BigDecimal computeNetMovement(@Param("accountId") UUID accountId);
}
