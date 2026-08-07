package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.Appointment;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Data
public class AppointmentRequest {
    private UUID hospitalId;
    private UUID branchId;
    private Integer patientId;
    private UUID doctorId;
    private LocalDate apptDate;
    private LocalTime apptTime;
    private Appointment.AppointmentType type;
    private String chiefComplaint;
    private UUID priceListId;
    private UUID packageId;

    // Emergency walk-in — patient can be created on the fly
    private String emergencyPatientName;
    private String emergencyPhone;

    // For status updates
    private Appointment.AppointmentStatus status;
    private String cancelledReason;
    private UUID refundBankAccountId;
    private String refundMode;
    private String noShowPaymentAction;
}
