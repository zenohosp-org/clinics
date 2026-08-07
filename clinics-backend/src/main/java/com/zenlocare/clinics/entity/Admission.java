package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "admissions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Admission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "room_id")
    private Room room;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "bed_id")
    private Bed bed;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "admitting_doctor_id")
    private Doctor admittingDoctor;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "department_id")
    private Department department;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_appointment_id")
    private Appointment sourceAppointment;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "previous_room_id")
    private Room previousRoom;

    @Column(name = "ot_booking_id")
    private UUID otBookingId;

    @Column(name = "admission_number", length = 30)
    private String admissionNumber;

    @Column(name = "ipd_id", length = 20, unique = true)
    private String ipdId;

    @Column(name = "admission_date", nullable = false)
    @Builder.Default
    private LocalDateTime admissionDate = LocalDateTime.now();

    @Column(name = "actual_discharge_date")
    private LocalDateTime actualDischargeDate;

    @Column(name = "approx_discharge_date")
    private LocalDateTime approxDischargeDate;

    @Convert(converter = com.zenlocare.clinics.converter.AdmissionTypeConverter.class)
    @Column(name = "admission_type_id")
    @Builder.Default
    private AdmissionType admissionType = AdmissionType.OPD_REFERRAL;

    @Convert(converter = com.zenlocare.clinics.converter.AdmissionSourceConverter.class)
    @Column(name = "admission_source_id")
    @Builder.Default
    private AdmissionSource admissionSource = AdmissionSource.DIRECT;

    @Column(name = "chief_complaint", columnDefinition = "TEXT")
    private String chiefComplaint;

    @Column(name = "primary_diagnosis", columnDefinition = "TEXT")
    private String primaryDiagnosis;

    @OneToOne(mappedBy = "admission", fetch = FetchType.LAZY, cascade = CascadeType.ALL, optional = true)
    private Discharge discharge;

    @Column(name = "attender_name", length = 100)
    private String attenderName;

    @Column(name = "attender_phone", length = 20)
    private String attenderPhone;

    @Column(name = "attender_relationship", length = 50)
    private String attenderRelationship;

    @Convert(converter = com.zenlocare.clinics.converter.AdmissionStatusConverter.class)
    @Column(name = "status_id")
    @Builder.Default
    private AdmissionStatus status = AdmissionStatus.ADMITTED;

    // Optimistic-lock cursor — two staff members trying to discharge or move
    // the same patient simultaneously will see one transaction commit and the
    // other throw OptimisticLockException (mapped to HTTP 409 by the global
    // handler). Prevents silent state corruption on concurrent edits.
    @jakarta.persistence.Version
    @Column(name = "version")
    @Builder.Default
    private Long version = 0L;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
