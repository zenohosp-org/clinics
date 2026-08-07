package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.HistoryType;
import com.zenlocare.clinics.entity.PatientRecord;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PatientRecordRepository extends JpaRepository<PatientRecord, UUID> {

    // Every read path that returns PatientRecord(s) to the controller must
    // eagerly fetch `createdBy` AND `createdBy.role` — the controller's DTO
    // mapper reads createdBy.firstName / lastName / role.displayName, and both
    // PatientRecord.createdBy and User→Role get treated as LAZY by the
    // EntityGraph(FETCH) default regardless of @ManyToOne(EAGER) on the entity.
    //
    // The earlier shortcut of listing only "createdBy" relied on User.role's
    // EAGER annotation, but Spring Data's default @EntityGraph type is FETCH,
    // which overrides field-level fetch settings: anything NOT explicitly in
    // attributePaths becomes LAZY. The role then surfaces as an uninitialised
    // Role proxy after the read-only TX closes, and the mapper's
    // role.getDisplayName() blows up with "Could not initialize proxy [Role#…]
    // - no session". List the nested path explicitly.

    List<PatientRecord> findByPatientId(Integer patientId);

    @EntityGraph(attributePaths = {"createdBy", "createdBy.role", "prescriptionItems", "attendingDoctor"})
    List<PatientRecord> findByPatientIdAndHospitalId(Integer patientId, UUID hospitalId);

    List<PatientRecord> findByHospitalId(UUID hospitalId);

    @EntityGraph(attributePaths = {"createdBy", "createdBy.role", "prescriptionItems", "attendingDoctor"})
    List<PatientRecord> findByCreatedByIdAndHospitalIdOrderByCreatedAtDesc(UUID createdById, UUID hospitalId);

    @EntityGraph(attributePaths = {"createdBy", "createdBy.role", "prescriptionItems", "attendingDoctor"})
    List<PatientRecord> findByPatientIdAndHospitalIdAndHistoryTypeOrderByCreatedAtDesc(
            Integer patientId, UUID hospitalId, HistoryType historyType);

    @EntityGraph(attributePaths = {"createdBy", "createdBy.role", "prescriptionItems", "attendingDoctor"})
    List<PatientRecord> findByPatientIdAndHospitalIdAndAdmissionIdAndHistoryTypeOrderByCreatedAtDesc(
            Integer patientId, UUID hospitalId, UUID admissionId, HistoryType historyType);

    /**
     * Every record type tied to a single admission, newest first — powers the
     * discharge summary print view, which needs the full clinical course of
     * the stay (consultations, prescriptions, lab results, surgery notes) in
     * one query rather than looping per HistoryType.
     */
    @EntityGraph(attributePaths = {"createdBy", "createdBy.role", "prescriptionItems", "attendingDoctor"})
    List<PatientRecord> findByPatientIdAndHospitalIdAndAdmissionIdOrderByCreatedAtDesc(
            Integer patientId, UUID hospitalId, UUID admissionId);

    @Query("SELECT COUNT(DISTINCT pr.patient.id) FROM PatientRecord pr WHERE pr.createdBy.id = :userId")
    long countUniquePatientsByDoctor(@Param("userId") UUID userId);

    /**
     * Single-appointment lookup used by the print view. Returns every record
     * tied to a given appointment (typically one CONSULTATION or PRESCRIPTION
     * row, occasionally a follow-up amendment), newest first. EntityGraph
     * pulls createdBy + role + prescriptionItems in one query so the print
     * page doesn't N+1 the bind sites.
     */
    @EntityGraph(attributePaths = {"createdBy", "createdBy.role", "prescriptionItems", "attendingDoctor"})
    List<PatientRecord> findByAppointmentIdAndHospitalIdOrderByCreatedAtDesc(
            UUID appointmentId, UUID hospitalId);

    /**
     * MRNs for a given hospital + year — RecordService.generateMrn extracts the
     * trailing sequence from each to compute next-seq = MAX + 1. Matching both
     * legacy "MRN-YYYY-NNNNN" and prefixed "{HOSP}-MRN-YYYY-NNNNN" formats; the
     * trailing-numeric extractor in the service handles either shape.
     */
    @Query("SELECT pr.mrn FROM PatientRecord pr WHERE pr.hospital.id = :hospitalId AND pr.mrn LIKE CONCAT('%MRN-', :year, '-%')")
    List<String> findMrnsForHospitalAndYear(@Param("hospitalId") UUID hospitalId, @Param("year") String year);

    /**
     * Latest record timestamp per patient — powers the "Last Visit" column on
     * the patient list. One grouped query for the whole page instead of N+1.
     */
    @Query("SELECT pr.patient.id, MAX(pr.createdAt) FROM PatientRecord pr " +
           "WHERE pr.patient.id IN :patientIds GROUP BY pr.patient.id")
    List<Object[]> findLastVisitDatesByPatientIds(@Param("patientIds") List<Integer> patientIds);

    /**
     * Fetch all OPD Prescriptions for a hospital.
     * OPD Prescriptions are PRESCRIPTION records with no admissionId.
     */
    @EntityGraph(attributePaths = {"createdBy", "createdBy.role", "prescriptionItems", "attendingDoctor", "patient"})
    List<PatientRecord> findByHospitalIdAndHistoryTypeAndAdmissionIdIsNullOrderByCreatedAtDesc(UUID hospitalId, HistoryType historyType);
}
