package com.zenlocare.clinics.dto;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;

@Data @Builder
public class GstRateDTO {
    private UUID id;
    private String name;
    private BigDecimal ratePercent;
    private BigDecimal cgstPercent;
    private BigDecimal sgstPercent;
    private BigDecimal igstPercent;
    private BigDecimal cessPercent;
    private Boolean isDefault;
    private Boolean isActive;
}
