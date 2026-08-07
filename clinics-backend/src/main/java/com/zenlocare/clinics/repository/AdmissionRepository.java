package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Admission;
import com.zenlocare.clinics.entity.AdmissionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdmissionRepository extends JpaRepository<Admission, UUID> {
    List<Admission> findByHospitalIdAndStatusOrderByAdmissionDateDesc(UUID hospitalId, AdmissionStatus status);
    List<Admission> findByHospitalIdOrderByAdmissionDateDesc(UUID hospitalId);
    List<Admission> findByPatientIdOrderByAdmissionDateDesc(Integer patientId);
    Optional<Admission> findByPatientIdAndStatus(Integer patientId, AdmissionStatus status);
    Optional<Admission> findByRoomIdAndStatus(Long roomId, AdmissionStatus status);

    boolean existsByBedIdAndStatus(Long bedId, AdmissionStatus status);
    boolean existsByRoomIdAndStatus(Long roomId, AdmissionStatus status);
    /**
     * Room-level exclusive lock check. Returns true when there's an active
     * admission targeting this room but with no specific bed picked — the
     * legacy "admit to whole room" flow. Per-bed allocations must respect
     * this lock; see {@code AdmissionService.isBedAvailable} for the call site.
     */
    boolean existsByRoomIdAndBedIdIsNullAndStatus(Long roomId, AdmissionStatus status);

    // Per-bed attender lookup: in a multi-bed ward each bed has its own admission,
    // and the BedDto needs to surface that admission's attender_* and id.
    Optional<Admission> findByBedIdAndStatus(Long bedId, AdmissionStatus status);

    // Batch active-admission lookup, used by RoomService to attach
    // attender + admissionId to a list of RoomDtos in one query.
    @Query("SELECT a FROM Admission a WHERE a.status = com.zenlocare.clinics.entity.AdmissionStatus.ADMITTED " +
           "AND a.room IS NOT NULL AND a.hospital.id = :hospitalId")
    List<Admission> findActiveAdmissionsByHospitalId(@Param("hospitalId") UUID hospitalId);

    List<Admission> findByRoomId(Long roomId);

    @Query("SELECT a FROM Admission a WHERE a.hospital.id = :hospitalId " +
           "AND a.status = com.zenlocare.clinics.entity.AdmissionStatus.ADMITTED " +
           "AND (LOWER(a.patient.firstName) LIKE LOWER(CONCAT('%',:q,'%')) " +
           "OR LOWER(a.patient.lastName) LIKE LOWER(CONCAT('%',:q,'%')) " +
           "OR LOWER(a.admissionNumber) LIKE LOWER(CONCAT('%',:q,'%')))")
    List<Admission> searchActive(@Param("hospitalId") UUID hospitalId, @Param("q") String query);

    @Query("SELECT COUNT(a) FROM Admission a WHERE a.hospital.id = :hospitalId " +
           "AND a.status = com.zenlocare.clinics.entity.AdmissionStatus.ADMITTED")
    long countActiveByHospital(@Param("hospitalId") UUID hospitalId);

    @Query("SELECT COUNT(a) FROM Admission a WHERE a.hospital.id = :hospitalId " +
           "AND a.status = com.zenlocare.clinics.entity.AdmissionStatus.ADMITTED " +
           "AND a.room IS NOT NULL AND a.room.roomType = 'OT'")
    long countActiveInOtByHospital(@Param("hospitalId") UUID hospitalId);

    @Query("SELECT COUNT(a) FROM Admission a WHERE a.hospital.id = :hospitalId " +
           "AND a.status = com.zenlocare.clinics.entity.AdmissionStatus.DISCHARGED " +
           "AND a.actualDischargeDate >= :startOfDay")
    long countDischargedTodayByHospital(@Param("hospitalId") UUID hospitalId, @Param("startOfDay") java.time.LocalDateTime startOfDay);

    @Query("SELECT COUNT(a) FROM Admission a WHERE a.hospital.id = :hospitalId " +
           "AND a.status = com.zenlocare.clinics.entity.AdmissionStatus.ADMITTED " +
           "AND a.approxDischargeDate < :now")
    long countOverdueByHospital(@Param("hospitalId") UUID hospitalId, @Param("now") java.time.LocalDateTime now);

    // Use explicit LEFT JOINs for optional relations (department, room) so admissions without
    // an assigned department or room are still included. Implicit `a.department.name` paths
    // generate INNER JOINs in Hibernate and silently exclude those rows.
    @Query("SELECT a FROM Admission a " +
           "LEFT JOIN a.department d " +
           "LEFT JOIN a.room r " +
           "WHERE a.hospital.id = :hospitalId " +
           "AND (:statusStr = 'ALL' OR a.status = :status) " +
           "AND (:q = '' " +
           "     OR LOWER(a.patient.firstName) LIKE LOWER(CONCAT('%',:q,'%')) " +
           "     OR LOWER(a.patient.lastName) LIKE LOWER(CONCAT('%',:q,'%')) " +
           "     OR LOWER(a.admissionNumber) LIKE LOWER(CONCAT('%',:q,'%')) " +
           "     OR LOWER(a.ipdId) LIKE LOWER(CONCAT('%',:q,'%')) " +
           "     OR LOWER(d.name) LIKE LOWER(CONCAT('%',:q,'%')) " +
           "     OR LOWER(r.roomNumber) LIKE LOWER(CONCAT('%',:q,'%'))" +
           ")")
    Page<Admission> searchAdmissions(
            @Param("hospitalId") UUID hospitalId,
            @Param("status") AdmissionStatus status,
            @Param("statusStr") String statusStr,
            @Param("q") String query,
            Pageable pageable);

    // Matches both legacy "IPD-2026-NNNN" and prefixed "1001-IPD-2026-NNNN" formats.
    // Service code parses the trailing sequence in Java because string MAX would otherwise
    // pick legacy IDs over prefixed ones due to ASCII ordering ('1' < 'I').
    @Query("SELECT a.ipdId FROM Admission a WHERE a.hospital.id = :hospitalId AND a.ipdId LIKE CONCAT('%IPD-', :year, '-%')")
    List<String> findIpdIdsForYear(@Param("hospitalId") UUID hospitalId, @Param("year") String year);
}
