package com.zenlocare.clinics.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.UUID;

@Data
public class RoomCreateRequest {
    private UUID hospitalId;
    private String roomPrefix;
    private String roomType;
    private Integer count;
    private BigDecimal pricePerDay;
    private UUID departmentId;
    private String ward;
    private Integer bedCount;
}
