package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BloodUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface BloodUnitRepository extends JpaRepository<BloodUnit, UUID> {

    Optional<BloodUnit> findByHospital_IdAndBagNumber(UUID hospitalId, String bagNumber);

    /**
     * Largest existing bag number for the hospital that matches `prefix%`.
     * Used to compute the next sequence value when auto-generating bag
     * numbers (callers pass e.g. "BG-2026-"). Returns null when none exist.
     * Because the suffix is zero-padded, lexical MAX equals numeric MAX.
     */
    @Query("""
        SELECT MAX(u.bagNumber) FROM BloodUnit u
        WHERE u.hospital.id = :hospitalId
          AND u.bagNumber LIKE CONCAT(:prefix, '%')
        """)
    String findMaxBagNumberWithPrefix(@Param("hospitalId") UUID hospitalId,
                                      @Param("prefix") String prefix);

    long countByHospital_Id(UUID hospitalId);

    @Query("""
        SELECT u FROM BloodUnit u
        WHERE u.hospital.id = :hospitalId
          AND (:groupCode IS NULL OR u.bloodGroupCode = :groupCode)
          AND (:componentCode IS NULL OR u.componentCode = :componentCode)
          AND (:statusCode IS NULL OR u.statusCode = :statusCode)
        ORDER BY u.expiryDate ASC, u.createdAt DESC
        """)
    List<BloodUnit> filter(@Param("hospitalId") UUID hospitalId,
                           @Param("groupCode") String groupCode,
                           @Param("componentCode") String componentCode,
                           @Param("statusCode") String statusCode);

    /** Counts by (bloodGroupCode, componentCode) for AVAILABLE units —
     *  drives the stock dashboard's group × component matrix. */
    @Query("""
        SELECT u.bloodGroupCode, u.componentCode, COUNT(u)
        FROM BloodUnit u
        WHERE u.hospital.id = :hospitalId
          AND u.statusCode = 'AVAILABLE'
        GROUP BY u.bloodGroupCode, u.componentCode
        """)
    List<Object[]> stockMatrix(@Param("hospitalId") UUID hospitalId);

    @Query("""
        SELECT COUNT(u) FROM BloodUnit u
        WHERE u.hospital.id = :hospitalId
          AND u.statusCode = 'AVAILABLE'
          AND u.expiryDate <= :threshold
        """)
    long countExpiringSoon(@Param("hospitalId") UUID hospitalId,
                           @Param("threshold") LocalDate threshold);

    @Query("""
        SELECT u FROM BloodUnit u
        WHERE u.hospital.id = :hospitalId
          AND u.statusCode = 'AVAILABLE'
          AND u.expiryDate <= :threshold
        ORDER BY u.expiryDate ASC
        """)
    List<BloodUnit> findExpiringSoon(@Param("hospitalId") UUID hospitalId,
                                     @Param("threshold") LocalDate threshold);

    @Query("""
        SELECT COUNT(u) FROM BloodUnit u
        WHERE u.hospital.id = :hospitalId AND u.statusCode = :statusCode
        """)
    long countByStatus(@Param("hospitalId") UUID hospitalId,
                       @Param("statusCode") String statusCode);
}
