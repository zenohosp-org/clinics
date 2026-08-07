package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.Appointment;
import com.zenlocare.clinics.entity.Patient;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.UUID;

@Data
@Builder
public class AppointmentDto {
        private UUID id;
        private UUID hospitalId;
        private UUID branchId;
        private Integer patientId;
        private String patientName;
        private String patientUhid;
        private String patientPhone;
        // Static patient attribute carried on the appointment payload so
        // the consultation modal can show it without a separate fetch.
        // Read-through from patients.blood_group; never written here.
        private String patientBloodGroup;
        // DOB and gender pulled in for the queue-walked Consultation View
        // page's left panel. Read-through from patients.dob / gender;
        // never written here.
        private java.time.LocalDate patientDob;
        private String patientGender;

        private UUID doctorId;
        private String doctorName;
        private String doctorSpecialization;

        private LocalDate apptDate;
        private LocalTime apptTime;
        private LocalTime apptEndTime;

        private Appointment.AppointmentType type;
        private Appointment.AppointmentStatus status;
        private Integer tokenNumber;

        private String chiefComplaint;
        private String cancelledReason;
        private UUID cancelledById;
        private String cancelledByName;
        private LocalDateTime cancelledAt;

        private UUID priceListId;
        private String priceListName;

        private UUID checkupBookingId;

        private UUID createdById;
        private String createdByName;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static AppointmentDto fromEntity(Appointment a) {
                String pName = a.getPatient().getFirstName()
                                + (a.getPatient().getLastName() != null ? " " + a.getPatient().getLastName() : "");
                String dName = a.getDoctor() != null
                                ? a.getDoctor().getUser().getFirstName() + (a.getDoctor().getUser().getLastName() != null ? " " + a.getDoctor().getUser().getLastName() : "")
                                : null;
                String creatorName = a.getCreatedBy().getFirstName()
                                + (a.getCreatedBy().getLastName() != null ? " " + a.getCreatedBy().getLastName() : "");
                String cancelledName = a.getCancelledBy() != null
                                ? a.getCancelledBy().getFirstName() + (a.getCancelledBy().getLastName() != null ? " " + a.getCancelledBy().getLastName() : "")
                                : null;

                return AppointmentDto.builder()
                                .id(a.getId())
                                .hospitalId(a.getHospital().getId())
                                .branchId(a.getBranchId())
                                .patientId(a.getPatient().getId())
                                .patientName(pName)
                                .patientUhid(a.getPatient().getUhid())
                                .patientPhone(a.getPatient().getPhone())
                                .patientBloodGroup(a.getPatient().getBloodGroup())
                                .patientDob(a.getPatient().getDob())
                                .patientGender(a.getPatient().getGender())
                                .doctorId(a.getDoctor() != null ? a.getDoctor().getId() : null)
                                .doctorName(dName)
                                .doctorSpecialization(a.getDoctor() != null ? a.getDoctor().getSpecialization() : null)
                                .apptDate(a.getApptDate())
                                .apptTime(a.getApptTime())
                                .apptEndTime(a.getApptEndTime())
                                .type(a.getType())
                                .status(a.getStatus())
                                .tokenNumber(a.getTokenNumber())
                                .chiefComplaint(a.getChiefComplaint())
                                .cancelledReason(a.getCancelledReason())
                                .cancelledById(a.getCancelledBy() != null ? a.getCancelledBy().getId() : null)
                                .cancelledByName(cancelledName)
                                .cancelledAt(a.getCancelledAt())
                                .priceListId(a.getPriceList() != null ? a.getPriceList().getId() : null)
                                .priceListName(a.getPriceList() != null ? a.getPriceList().getName() : null)
                                // Booking number + package name lived as denormalised reads off
                                // the @ManyToOne. Now that labs owns the booking, the join is
                                // gone — HMS exposes only the flat checkupBookingId UUID. The
                                // appointments page's checkup link still navigates via the id;
                                // it just renders without the number label.
                                .checkupBookingId(a.getCheckupBookingId())
                                .createdById(a.getCreatedBy().getId())
                                .createdByName(creatorName)
                                .createdAt(a.getCreatedAt())
                                .updatedAt(a.getUpdatedAt())
                                .build();
        }
}
