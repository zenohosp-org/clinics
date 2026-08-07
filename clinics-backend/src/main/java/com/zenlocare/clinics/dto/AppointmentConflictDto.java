package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.Appointment;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Lean, PII-minimal projection of an appointment, exposed cross-app to the
 * People (HR) service so it can warn an admin that a doctor already has
 * appointments / followups inside the leave window they're about to record.
 *
 * Deliberately NOT {@link AppointmentDto}: that carries patient phone, blood
 * group, DOB and gender, none of which belong on the leave-conflict list. A
 * followup is just an {@code Appointment} with {@code type = FOLLOWUP}, so the
 * caller distinguishes the two off {@link #type}.
 */
@Data
@Builder
public class AppointmentConflictDto {
        private UUID appointmentId;
        private LocalDate apptDate;
        private LocalTime apptTime;

        private UUID doctorId;

        private Integer patientId;
        private String patientName;
        private String patientUhid;

        private Appointment.AppointmentType type;
        private Appointment.AppointmentStatus status;
        private Integer tokenNumber;

        public static AppointmentConflictDto fromEntity(Appointment a) {
                String patientName = a.getPatient().getFirstName()
                                + (a.getPatient().getLastName() != null ? " " + a.getPatient().getLastName() : "");
                return AppointmentConflictDto.builder()
                                .appointmentId(a.getId())
                                .apptDate(a.getApptDate())
                                .apptTime(a.getApptTime())
                                .doctorId(a.getDoctor() != null ? a.getDoctor().getId() : null)
                                .patientId(a.getPatient().getId())
                                .patientName(patientName)
                                .patientUhid(a.getPatient().getUhid())
                                .type(a.getType())
                                .status(a.getStatus())
                                .tokenNumber(a.getTokenNumber())
                                .build();
        }
}
