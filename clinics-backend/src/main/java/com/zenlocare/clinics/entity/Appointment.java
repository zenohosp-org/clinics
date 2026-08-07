package com.zenlocare.clinics.entity;

import com.zenlocare.clinics.converter.AppointmentStatusConverter;
import com.zenlocare.clinics.converter.AppointmentTypeConverter;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "appointments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Appointment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @Column(name = "branch_id")
    private UUID branchId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "doctor_id")
    private Doctor doctor;

    @Column(name = "appt_date", nullable = false)
    private LocalDate apptDate;

    @Column(name = "appt_time", nullable = false)
    private LocalTime apptTime;

    @Column(name = "appt_end_time")
    private LocalTime apptEndTime;

    @Convert(converter = AppointmentTypeConverter.class)
    @Column(name = "type_id")
    private AppointmentType type;

    @Convert(converter = AppointmentStatusConverter.class)
    @Column(name = "status_id")
    @Builder.Default
    private AppointmentStatus status = AppointmentStatus.SCHEDULED;

    @Column(name = "token_number")
    private Integer tokenNumber;

    @Column(name = "chief_complaint", columnDefinition = "TEXT")
    private String chiefComplaint;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "price_list_id")
    private PriceList priceList;

    @Column(name = "cancelled_reason", columnDefinition = "TEXT")
    private String cancelledReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cancelled_by")
    private User cancelledBy;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admission_id")
    private com.zenlocare.clinics.entity.Admission admission;

    // Health-checkup bookings live in the labs service post-migration.
    // The DB column stays UUID — we just stop loading the related entity
    // here. Labs is the owner of the row; HMS only stores the FK.
    @Column(name = "checkup_booking_id")
    private UUID checkupBookingId;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public enum AppointmentType {
        OPD(1), FOLLOWUP(2), EMERGENCY(3), TELECONSULT(4), HEALTH_CHECKUP(5);

        public final int id;

        AppointmentType(int id) { this.id = id; }

        public static AppointmentType fromId(int id) {
            for (AppointmentType t : values()) {
                if (t.id == id) return t;
            }
            throw new IllegalArgumentException("Unknown AppointmentType id: " + id);
        }
    }

    public enum AppointmentStatus {
        SCHEDULED(1), CONFIRMED(2), CHECKED_IN(3), IN_PROGRESS(4),
        COMPLETED(5), CANCELLED(6), NO_SHOW(7), BILLED(8), EXPIRED(9);

        public final int id;

        AppointmentStatus(int id) { this.id = id; }

        public static AppointmentStatus fromId(int id) {
            for (AppointmentStatus s : values()) {
                if (s.id == id) return s;
            }
            throw new IllegalArgumentException("Unknown AppointmentStatus id: " + id);
        }
    }
}
