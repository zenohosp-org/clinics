package com.zenlocare.clinics.dto;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class RoomLogDTO {
    private Long id;
    private Long roomId;
    private String roomNumber;
    private String event;
    private String patientName;
    private String patientUhid;
    private String attenderName;
    private String allocationToken;
    private String performedBy;
    private LocalDateTime createdAt;
}
