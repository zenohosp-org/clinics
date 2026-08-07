package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Patient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

@Repository
public interface PatientRepository extends JpaRepository<Patient, Integer> {
    List<Patient> findByHospitalId(UUID hospitalId);

    Optional<Patient> findByHospitalIdAndUhid(UUID hospitalId, String uhid);

    Optional<Patient> findByIdAndHospitalId(Integer patientId, UUID hospitalId);

    long countByHospitalId(UUID hospitalId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(p) FROM Patient p WHERE p.hospital.id = :hid AND CAST(p.createdAt AS date) = CURRENT_DATE")
    long countRegisteredToday(@org.springframework.data.repository.query.Param("hid") UUID hospitalId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(p) FROM Patient p WHERE p.hospital.id = :hid AND p.createdAt >= :start")
    long countRegisteredSince(@org.springframework.data.repository.query.Param("hid") UUID hospitalId, @org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(p) FROM Patient p WHERE p.hospital.id = :hid AND p.createdAt >= :start AND p.createdAt < :end")
    long countRegisteredBetween(@org.springframework.data.repository.query.Param("hid") UUID hospitalId, @org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start, @org.springframework.data.repository.query.Param("end") java.time.LocalDateTime end);

    @org.springframework.data.jpa.repository.Query(value = "SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as regDate, COUNT(*) as regCount " +
            "FROM patients " +
            "WHERE hospital_id = :hid " +
            "AND created_at >= :startDate " +
            "GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') " +
            "ORDER BY regDate ASC", nativeQuery = true)
    List<Object[]> getDailyRegistrationTrend(@org.springframework.data.repository.query.Param("hid") UUID hospitalId, @org.springframework.data.repository.query.Param("startDate") java.time.LocalDateTime startDate);

    @org.springframework.data.jpa.repository.Query(value = "SELECT " +
            "  CASE " +
            "    WHEN EXTRACT(YEAR FROM AGE(dob)) BETWEEN 0  AND 17 THEN '0–17' " +
            "    WHEN EXTRACT(YEAR FROM AGE(dob)) BETWEEN 18 AND 34 THEN '18–34' " +
            "    WHEN EXTRACT(YEAR FROM AGE(dob)) BETWEEN 35 AND 54 THEN '35–54' " +
            "    WHEN EXTRACT(YEAR FROM AGE(dob)) BETWEEN 55 AND 74 THEN '55–74' " +
            "    ELSE '75+' " +
            "  END as age_group, " +
            "  COUNT(*) as count " +
            "FROM patients " +
            "WHERE hospital_id = :hid AND dob IS NOT NULL " +
            "GROUP BY age_group " +
            "ORDER BY age_group", nativeQuery = true)
    List<Object[]> getAgeGroupBreakdown(@org.springframework.data.repository.query.Param("hid") UUID hospitalId);

    @org.springframework.data.jpa.repository.Query("SELECT p FROM Patient p WHERE p.hospital.id = :hospitalId AND " +
            "(LOWER(p.firstName) LIKE LOWER(CONCAT('%', :searchTerm, '%')) " +
            "OR LOWER(p.lastName) LIKE LOWER(CONCAT('%', :searchTerm, '%')) " +
            "OR LOWER(p.uhid) LIKE LOWER(CONCAT('%', :searchTerm, '%')) " +
            "OR LOWER(p.phone) LIKE LOWER(CONCAT('%', :searchTerm, '%')))")
    List<Patient> searchPatients(
            @org.springframework.data.repository.query.Param("hospitalId") UUID hospitalId,
            @org.springframework.data.repository.query.Param("searchTerm") String searchTerm,
            org.springframework.data.domain.Pageable pageable);

    @org.springframework.data.jpa.repository.Query("""
        SELECT p FROM Patient p
        WHERE p.hospital.id = :hospitalId
        AND (
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName)  LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid)      LIKE LOWER(CONCAT('%', :search, '%')) OR
            p.phone            LIKE CONCAT('%', :search, '%')
        )
        ORDER BY p.createdAt DESC
        """)
    Page<Patient> searchByHospital(
        @org.springframework.data.repository.query.Param("hospitalId") UUID hospitalId,
        @org.springframework.data.repository.query.Param("search") String search,
        Pageable pageable
    );
}
