package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.controller.RecordController.PendingPrescriptionDto;
import lombok.Data;
import java.util.List;

@Data
public class OpdPrescriptionDto {
    private String recordId;
    private String patientId;
    private String patientName;
    private String patientPhone;
    private String doctorName;
    private String prescribedAt;
    private Integer drugCount;
    private String status; // FULLY_DISPENSED, PARTIALLY_DISPENSED, NOT_SOLD, PENDING
    private List<PendingPrescriptionDto> items;
}
