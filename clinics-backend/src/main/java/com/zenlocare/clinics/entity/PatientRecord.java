package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "patient_records")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PatientRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "history_id")
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id", nullable = false)
    private Hospital hospital;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy; // User (doctor or staff) who created this record

    // CONSULTATION | PRESCRIPTION | LAB_RESULT | SURGERY | DIAGNOSIS | OTHERS
    // Persisted as integer FK into record_history_types (see HistoryTypeConverter).
    // The legacy `history_type` (String) column remains in the DB as a ghost
    // for any old code paths until cleanup; new writes only touch history_type_id.
    @Convert(converter = com.zenlocare.clinics.converter.HistoryTypeConverter.class)
    @Column(name = "history_type_id")
    private HistoryType historyType;

    @Column(columnDefinition = "TEXT")
    private String description;

    // Patient-facing care instructions (rest, diet, follow-up triggers) kept
    // separate from the doctor's narrative description so the discharge / OPD
    // print can split them cleanly without parsing prose.
    @Column(columnDefinition = "TEXT")
    private String instructions;

    // Structured SOAP note fields (Subjective/Objective/Assessment/Plan), used
    // by PROGRESS_NOTE records. All nullable — non-progress-note records and
    // legacy progress notes leave these unset and rely on `description` instead.
    @Column(name = "soap_subjective", columnDefinition = "TEXT")
    private String soapSubjective;

    @Column(name = "soap_objective", columnDefinition = "TEXT")
    private String soapObjective;

    @Column(name = "soap_assessment", columnDefinition = "TEXT")
    private String soapAssessment;

    @Column(name = "soap_plan", columnDefinition = "TEXT")
    private String soapPlan;

    @Column(name = "next_visit_date")
    private LocalDateTime nextVisitDate;

    @Column(name = "admission_id")
    private UUID admissionId;

    @Column(name = "admission_number", length = 50)
    private String admissionNumber;

    // OPD audit trail — links a PRESCRIPTION (or CONSULTATION) record back to
    // the appointment it was written for. Nullable: legacy records and IPD-only
    // records don't have one. Admission flows continue to use admissionId.
    @Column(name = "appointment_id")
    private UUID appointmentId;

    @Column(name = "mrn", length = 30, unique = true)
    private String mrn;

    /**
     * Structured prescription lines. Empty for non-PRESCRIPTION records.
     * Cascade ALL + orphanRemoval ensures items live and die with the parent
     * record — there's no standalone prescription_item; it's always part of
     * a clinical record. Pharmacy reads these to dispense.
     */
    @OneToMany(mappedBy = "record", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<PrescriptionItem> prescriptionItems = new ArrayList<>();

    /**
     * The doctor who saw/prescribed — may differ from {@code createdBy} when
     * a staff member or admin enters the record on behalf of a doctor (Scenario B).
     * Null when the creator is themselves the attending doctor.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attending_doctor_id")
    private User attendingDoctor;

    // The FKs above stay as the live pointers and remain the query keys — these
    // columns are display-only. Write-once; re-derive only if the FK itself is
    // reassigned to a different person.
    //
    // These three columns already existed on the shared `patient_records`
    // table (added by HMS after clinics forked); this entity never mapped
    // them. created_by_name_snapshot is NOT NULL — every record creation was
    // failing until this was added, same as invoices.patient_name_snapshot.

    /** Author's name as it stood when the record was written. */
    @Column(name = "created_by_name_snapshot", length = 255)
    private String createdByNameSnapshot;

    /**
     * Author's role as it stood when the record was written. Frozen separately
     * because the discharge summary prints it beside the name, and a later
     * promotion must not change who signed as what.
     */
    @Column(name = "created_by_role_snapshot", length = 100)
    private String createdByRoleSnapshot;

    /** Attending doctor's name at write time. Null when none was recorded. */
    @Column(name = "attending_doctor_name_snapshot", length = 255)
    private String attendingDoctorNameSnapshot;

    @Builder.Default
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
