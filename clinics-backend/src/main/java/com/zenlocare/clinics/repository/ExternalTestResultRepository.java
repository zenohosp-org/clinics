package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.ExternalTestResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface ExternalTestResultRepository extends JpaRepository<ExternalTestResult, UUID> {

    /**
     * Patient-scoped listing with optional category + date-range filters.
     * Pagination via Spring Data Pageable so the dashboard can chunk long
     * histories. test_date is the sort key, not created_at, so backdated
     * entries (the doctor typing in a report from last month) surface in
     * the right place chronologically.
     */
    @Query("""
            SELECT r FROM ExternalTestResult r
            WHERE r.hospitalId = :hospitalId
              AND r.patientId  = :patientId
              AND (:category IS NULL OR r.category = :category)
              AND (:from IS NULL OR r.testDate >= :from)
              AND (:to   IS NULL OR r.testDate <= :to)
            ORDER BY r.testDate DESC, r.createdAt DESC
            """)
    Page<ExternalTestResult> listForPatient(
            @Param("hospitalId") UUID hospitalId,
            @Param("patientId") Integer patientId,
            @Param("category") String category,
            @Param("from") LocalDate from,
            @Param("to")   LocalDate to,
            Pageable pageable);

    List<ExternalTestResult> findByRecordIdOrderByTestDateDesc(UUID recordId);

    /**
     * Visit-scoped listing — backs the consultation Lab Tests tab and
     * the print sheet. Newest first (createdAt) so a re-entered
     * correction shows up before the original it supersedes.
     */
    List<ExternalTestResult> findByAppointmentIdAndHospitalIdOrderByCreatedAtDesc(
            UUID appointmentId, UUID hospitalId);
}
