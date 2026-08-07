package com.zenlocare.clinics.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class RoomAllocationRequest {
    private Long roomId;
    private Integer patientId;
    private LocalDateTime approxDischargeTime;
    private String attenderName;
    private String attenderPhone;
    private String attenderRelationship;
    private Long bedId;
}
