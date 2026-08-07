package com.zenlocare.clinics.dto;

import lombok.*;
import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BankAccountDTO {
    private UUID id;
    private String accountName;
    private String accountNumber;
    private String accountType;
    private String bankName;
    private String branch;
    private String ifscCode;
    private Boolean isDefault;
    private BigDecimal openingBalance;
    private BigDecimal currentBalance;
}
