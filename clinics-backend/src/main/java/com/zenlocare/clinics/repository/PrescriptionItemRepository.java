package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PrescriptionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface PrescriptionItemRepository extends JpaRepository<PrescriptionItem, UUID> {

    /**
     * Hospital-wide pending IPD prescription items. Joins through the parent
     * PatientRecord to require an admissionId, and fetches patient + creator
     * eagerly so the pharmacy queue UI can render rows without a per-row
     * lookup. Excludes anything already fully dispensed.
     *
     * Ordered oldest-first so the most urgent (longest-waiting) request
     * surfaces at the top of the pharmacist's queue.
     */
    // NOTE: createdBy is a non-optional association, so this must stay an INNER
    // join — a LEFT JOIN FETCH makes Hibernate throw EntityNotFound for records
    // whose creating user was deleted (dangling created_by), 500ing the whole
    // queue. The inner join instead silently hides such rows; repair the data
    // (point created_by at a live user) if a prescription goes missing here.
    @Query("""
            SELECT pi FROM PrescriptionItem pi
            JOIN FETCH pi.record r
            JOIN FETCH r.patient p
            JOIN FETCH r.createdBy u
            WHERE r.hospital.id = :hospitalId
              AND r.admissionId IS NOT NULL
              AND pi.dispenseStatus <> com.zenlocare.clinics.entity.PrescriptionDispenseStatus.DISPENSED
            ORDER BY r.createdAt ASC
            """)
    List<PrescriptionItem> findPendingIpd(@Param("hospitalId") UUID hospitalId);

    /**
     * All prescription items ordered during a single IPD admission, for the MAR
     * tab. Joins through the parent PatientRecord to filter by both admissionId
     * and hospitalId (tenant isolation). Includes all dispense statuses — the
     * MAR needs to track administration of every ordered drug, including those
     * already dispensed by pharmacy.
     *
     * Ordered by prescription date then display_order so drugs appear in the
     * same sequence as on the printed prescription.
     */
    @Query("""
            SELECT pi FROM PrescriptionItem pi
            JOIN FETCH pi.record r
            JOIN FETCH r.createdBy u
            LEFT JOIN FETCH pi.stoppedBy sb
            WHERE r.admissionId = :admissionId
              AND r.hospital.id = :hospitalId
            ORDER BY r.createdAt ASC, pi.displayOrder ASC
            """)
    List<PrescriptionItem> findByAdmissionIdAndHospitalId(
            @Param("admissionId") UUID admissionId,
            @Param("hospitalId") UUID hospitalId);

    /**
     * Inverse lookup for the drug-switch chain. Given a batch of "old" prescription
     * item ids, returns the new items that replaced any of them — one query
     * powers the MAR card's "→ switched to {drug}" badge without a per-row trip.
     * In practice each old order has at most one replacement (you don't switch
     * twice), but the query returns a list so the controller can defend against
     * malformed data without falling over.
     */
    @Query("""
            SELECT pi FROM PrescriptionItem pi
            WHERE pi.replacesPrescriptionItemId IN :ids
            """)
    List<PrescriptionItem> findReplacementsByOldItemIds(@Param("ids") Collection<UUID> ids);

    /**
     * Batch lookup for the "old drug name" the new card needs to render its
     * "← replaces {drug}" badge. We only return the name and id, not the full
     * row, because the MAR card never needs the old order's dispense state.
     */
    @Query("""
            SELECT pi.id, pi.drugName, pi.drugStrength FROM PrescriptionItem pi
            WHERE pi.id IN :ids
            """)
    List<Object[]> findIdNameStrengthIn(@Param("ids") Collection<UUID> ids);
}
