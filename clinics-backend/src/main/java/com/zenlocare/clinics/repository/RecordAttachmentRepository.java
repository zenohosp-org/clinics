package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.RecordAttachment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface RecordAttachmentRepository extends JpaRepository<RecordAttachment, UUID> {

    /**
     * Patient-scoped listing with optional category + recordId filters. Used
     * by the consultation modal / page to surface attachments on the current
     * patient, and by Patient Details to render the read-only timeline.
     *
     * Tenant scoping is enforced by the caller via {@code hospitalId}; the
     * query itself does not assume it (matches the rest of the repository
     * layer's convention).
     */
    @Query("""
            SELECT a FROM RecordAttachment a
            WHERE a.hospitalId = :hospitalId
              AND a.patientId  = :patientId
              AND (:category IS NULL OR a.category = :category)
              AND (:recordId IS NULL OR a.recordId = :recordId)
            ORDER BY a.createdAt DESC
            """)
    Page<RecordAttachment> listForPatient(
            @Param("hospitalId") UUID hospitalId,
            @Param("patientId") Integer patientId,
            @Param("category") String category,
            @Param("recordId") UUID recordId,
            Pageable pageable);

    List<RecordAttachment> findByRecordIdOrderByCreatedAtDesc(UUID recordId);
}
