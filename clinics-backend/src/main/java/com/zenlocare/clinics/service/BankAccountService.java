package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.BankAccountDTO;
import com.zenlocare.clinics.entity.BankAccount;
import com.zenlocare.clinics.repository.BankAccountRepository;
import com.zenlocare.clinics.repository.BankTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class BankAccountService {

    private final BankAccountRepository accountRepository;
    private final BankTransactionRepository transactionRepository;

    public List<BankAccountDTO> listByHospital(UUID hospitalId) {
        return accountRepository.findByHospitalId(hospitalId)
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    /**
     * Returns accounts whose accountType matches one of the supplied values
     * (case-insensitive). Used by payment flows to constrain selection — e.g.
     * "Cash" payments may only credit CASH accounts; UPI/Card/Bank Transfer
     * may only credit SAVINGS / CURRENT.
     */
    public List<BankAccountDTO> listByHospitalAndTypes(UUID hospitalId, List<String> types) {
        if (types == null || types.isEmpty()) return listByHospital(hospitalId);
        java.util.Set<String> wanted = types.stream()
                .map(s -> s.toUpperCase().trim())
                .collect(Collectors.toSet());
        return accountRepository.findByHospitalId(hospitalId)
                .stream()
                .filter(a -> a.getAccountType() != null
                        && wanted.contains(a.getAccountType().toUpperCase().trim()))
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    private BankAccountDTO toDTO(BankAccount a) {
        BigDecimal netMovement = transactionRepository.computeNetMovement(a.getId());
        BigDecimal currentBalance = a.getOpeningBalance().add(netMovement);
        return BankAccountDTO.builder()
                .id(a.getId())
                .accountName(a.getAccountName())
                .accountNumber(a.getAccountNumber())
                .accountType(a.getAccountType())
                .bankName(a.getBankName())
                .branch(a.getBranch())
                .ifscCode(a.getIfscCode())
                .isDefault(a.getIsDefault())
                .openingBalance(a.getOpeningBalance())
                .currentBalance(currentBalance)
                .build();
    }
}
