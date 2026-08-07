package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
    List<BankAccount> findByHospitalId(UUID hospitalId);
}
