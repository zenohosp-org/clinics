package com.zenlocare.clinics.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;

@Data
public class GstRateRequest {
    private String name;
    private BigDecimal ratePercent;
    private BigDecimal cgstPercent;
    private BigDecimal sgstPercent;
    private BigDecimal igstPercent;
    private BigDecimal cessPercent;
    private Boolean isDefault;
}
