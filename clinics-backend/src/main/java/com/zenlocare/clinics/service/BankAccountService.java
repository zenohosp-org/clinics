package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.BankAccountDTO;
import com.zenlocare.clinics.entity.BankAccount;
import com.zenlocare.clinics.repository.BankAccountRepository;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.ConflictException;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
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

    // ── Mutations ────────────────────────────────────────────────────────────
    //
    // The bank_accounts table is shared with the finance service, which maps the
    // same rows plus its own audit columns (updated_by / updated_by_name).
    // Clinics does not map those, so JPA leaves them untouched rather than
    // nulling them — an edit made here shows in finance with its previous
    // audit stamp. Writing rows to a shared table is fine under
    // ddl-auto=none; only schema changes are off-limits.

    @Transactional
    public BankAccountDTO create(UUID hospitalId, BankAccountDTO req) {
        validate(req);
        String number = req.getAccountNumber().trim();
        if (accountRepository.existsByHospitalIdAndAccountNumberIgnoreCase(hospitalId, number)) {
            throw new ConflictException("An account with number " + number + " already exists");
        }

        BankAccount a = new BankAccount();
        a.setHospitalId(hospitalId);
        apply(a, req, number);
        // Opening balance is immutable after creation — see update().
        a.setOpeningBalance(req.getOpeningBalance() == null ? BigDecimal.ZERO : req.getOpeningBalance());

        // First account for a hospital becomes the default automatically, so
        // payment flows always have something selected rather than an empty
        // dropdown on day one.
        boolean wantsDefault = Boolean.TRUE.equals(req.getIsDefault())
                || accountRepository.findByHospitalId(hospitalId).isEmpty();
        a.setIsDefault(wantsDefault);

        a = accountRepository.save(a);
        if (wantsDefault) demoteOtherDefaults(hospitalId, a.getId());
        return toDTO(a);
    }

    @Transactional
    public BankAccountDTO update(UUID hospitalId, UUID id, BankAccountDTO req) {
        validate(req);
        BankAccount a = requireOwned(hospitalId, id);
        String number = req.getAccountNumber().trim();
        if (accountRepository.existsByHospitalIdAndAccountNumberIgnoreCaseAndIdNot(hospitalId, number, id)) {
            throw new ConflictException("Another account with number " + number + " already exists");
        }

        apply(a, req, number);

        // openingBalance is deliberately NOT updatable. currentBalance is derived
        // as openingBalance + net transaction movement, so editing it here would
        // silently restate every historical balance and break reconciliation
        // against the finance day book. Correct an opening balance with an
        // adjusting transaction instead.

        if (Boolean.TRUE.equals(req.getIsDefault())) {
            a.setIsDefault(true);
            accountRepository.save(a);
            demoteOtherDefaults(hospitalId, id);
        } else if (Boolean.TRUE.equals(a.getIsDefault()) && !Boolean.TRUE.equals(req.getIsDefault())) {
            // Refuse to leave a hospital with no default; clearing one is done by
            // making a different account the default.
            throw new BadRequestException(
                    "Set another account as default instead of clearing this one");
        }

        return toDTO(accountRepository.save(a));
    }

    @Transactional
    public void delete(UUID hospitalId, UUID id) {
        BankAccount a = requireOwned(hospitalId, id);
        if (transactionRepository.existsByBankAccountId(id)) {
            throw new BadRequestException(
                    "This account has transactions and cannot be deleted. "
                            + "Money already recorded against it would lose its ledger.");
        }
        if (Boolean.TRUE.equals(a.getIsDefault())
                && accountRepository.findByHospitalId(hospitalId).size() > 1) {
            throw new BadRequestException(
                    "Make another account the default before deleting this one");
        }
        accountRepository.delete(a);
    }

    /** Tenant check at the row level — the id in the URL must belong to the caller's hospital. */
    private BankAccount requireOwned(UUID hospitalId, UUID id) {
        BankAccount a = accountRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Bank account not found"));
        if (!a.getHospitalId().equals(hospitalId)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Bank account belongs to another hospital");
        }
        return a;
    }

    private void demoteOtherDefaults(UUID hospitalId, UUID keepId) {
        accountRepository.findByHospitalIdAndIsDefaultTrue(hospitalId).stream()
                .filter(other -> !other.getId().equals(keepId))
                .forEach(other -> {
                    other.setIsDefault(false);
                    accountRepository.save(other);
                });
    }

    private void apply(BankAccount a, BankAccountDTO req, String number) {
        a.setAccountName(req.getAccountName().trim());
        a.setAccountNumber(number);
        a.setAccountType(req.getAccountType() == null ? null : req.getAccountType().trim().toUpperCase());
        a.setBankName(req.getBankName() == null ? null : req.getBankName().trim());
        a.setBranch(req.getBranch() == null ? null : req.getBranch().trim());
        a.setIfscCode(req.getIfscCode() == null ? null : req.getIfscCode().trim().toUpperCase());
    }

    private void validate(BankAccountDTO req) {
        if (req.getAccountName() == null || req.getAccountName().isBlank()) {
            throw new BadRequestException("Account name is required");
        }
        if (req.getAccountNumber() == null || req.getAccountNumber().isBlank()) {
            throw new BadRequestException("Account number is required");
        }
        // CASH is a real account type here (petty cash drawer), and a cash
        // "account number" is a label rather than a bank number, so no format
        // rule is imposed beyond non-blank.
        if (req.getOpeningBalance() != null
                && req.getOpeningBalance().compareTo(BigDecimal.ZERO) < 0) {
            throw new BadRequestException("Opening balance cannot be negative");
        }
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
