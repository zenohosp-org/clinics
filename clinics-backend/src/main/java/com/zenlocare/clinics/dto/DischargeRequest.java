package com.zenlocare.clinics.dto;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class DischargeRequest {
    private LocalDateTime actualDischargeDate;
    private String dischargeDiagnosis;
    private String dischargeNote;
    private boolean createFollowUp;
    private LocalDate followUpDate;
    private UUID followUpDoctorId;
}
