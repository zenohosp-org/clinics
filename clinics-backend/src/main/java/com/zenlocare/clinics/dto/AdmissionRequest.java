package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.AdmissionSource;
import com.zenlocare.clinics.entity.AdmissionType;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class AdmissionRequest {
    private UUID hospitalId;
    private Integer patientId;
    private Long roomId;
    private UUID admittingDoctorId;
    private UUID departmentId;
    private UUID sourceAppointmentId;
    private AdmissionType admissionType;
    private AdmissionSource admissionSource;
    private Long bedId;
    private String chiefComplaint;
    private LocalDateTime approxDischargeDate;
    private String attenderName;
    private String attenderPhone;
    private String attenderRelationship;
}
