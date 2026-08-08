package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
    List<BankAccount> findByHospitalId(UUID hospitalId);

    List<BankAccount> findByHospitalIdAndIsDefaultTrue(UUID hospitalId);

    /**
     * Account numbers must be unique within a hospital — the same number added
     * twice would let two rows accumulate separate balances for one real
     * account, and payment flows would silently credit whichever came back
     * first. Excludes a given id so an edit that leaves the number unchanged
     * doesn't collide with itself.
     */
    boolean existsByHospitalIdAndAccountNumberIgnoreCaseAndIdNot(
            UUID hospitalId, String accountNumber, UUID id);

    boolean existsByHospitalIdAndAccountNumberIgnoreCase(UUID hospitalId, String accountNumber);
}
