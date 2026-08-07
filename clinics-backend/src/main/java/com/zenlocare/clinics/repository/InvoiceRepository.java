package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.entity.InvoiceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {
    @Query("SELECT i FROM Invoice i LEFT JOIN FETCH i.patient WHERE i.hospital.id = :hospitalId ORDER BY i.createdAt DESC")
    List<Invoice> findByHospitalIdWithPatient(@Param("hospitalId") UUID hospitalId);

    @Query("SELECT i FROM Invoice i LEFT JOIN FETCH i.patient WHERE i.patient.id = :patientId ORDER BY i.createdAt DESC")
    List<Invoice> findByPatientIdWithPatient(@Param("patientId") Integer patientId);

    List<Invoice> findByHospitalId(UUID hospitalId);

    @Query("SELECT COALESCE(SUM(i.total), 0.0) FROM Invoice i WHERE i.hospital.id = :hid AND i.status IN (com.zenlocare.clinics.entity.InvoiceStatus.PAID, com.zenlocare.clinics.entity.InvoiceStatus.SETTLED)")
    double sumPaidByHospital(@Param("hid") UUID hospitalId);

    /**
     * Invoices where the patient has paid more than they owe — typically because
     * a credit-note (ward return) landed after the bill was settled. Drives the
     * finance app's "Pending Refunds" page; each row exposes how much is
     * refundable so the finance user can issue it in one click.
     *
     * JOIN FETCH patient so the DTO mapper can read uhid + name without N+1.
     * Filters out CANCELLED invoices — those don't represent owed money.
     */
    @Query("""
        SELECT i FROM Invoice i
        LEFT JOIN FETCH i.patient p
        WHERE i.hospital.id = :hospitalId
          AND i.status <> com.zenlocare.clinics.entity.InvoiceStatus.CANCELLED
          AND COALESCE(i.paidAmount, 0) > COALESCE(i.total, 0)
        ORDER BY i.updatedAt DESC
        """)
    List<Invoice> findOverpaidByHospital(@Param("hospitalId") UUID hospitalId);

    @Query("SELECT COALESCE(SUM(i.total), 0.0) FROM Invoice i WHERE i.hospital.id = :hid AND i.status NOT IN (com.zenlocare.clinics.entity.InvoiceStatus.PAID, com.zenlocare.clinics.entity.InvoiceStatus.SETTLED, com.zenlocare.clinics.entity.InvoiceStatus.CANCELLED)")
    double sumOutstandingByHospital(@Param("hid") UUID hospitalId);

    @Query(value = "SELECT TO_CHAR(created_at, 'YYYY-MM') as month_str, " +
            "       SUM(CASE WHEN status_id IN (3, 5) THEN total ELSE 0 END) as paid, " +
            "       SUM(CASE WHEN status_id NOT IN (3, 5, 4) THEN total ELSE 0 END) as unpaid " +
            "FROM invoices " +
            "WHERE hospital_id = :hid " +
            "  AND created_at >= :startDate " +
            "GROUP BY TO_CHAR(created_at, 'YYYY-MM') " +
            "ORDER BY month_str ASC", nativeQuery = true)
    List<Object[]> getMonthlyRevenueSummary(@Param("hid") UUID hospitalId, @Param("startDate") java.time.LocalDateTime startDate);

    List<Invoice> findByPatientId(Integer patientId);
    List<Invoice> findByPatientIdOrderByCreatedAtDesc(Integer patientId);
    Invoice findByInvoiceNumber(String invoiceNumber);
    List<Invoice> findAllByAdmission_IdOrderByCreatedAtDesc(UUID admissionId);
    Optional<Invoice> findByAppointment_Id(UUID appointmentId);
    boolean existsByAppointment_Id(UUID appointmentId);

    // Open OPD bills for a patient — used by the admit modal's "merge into IPD" picker.
    // Returns invoices that are linked to an appointment, not yet linked to any admission,
    // and still collectible (not PAID / SETTLED / CANCELLED). Most recent first.
    //
    // JOIN FETCH appointment → doctor → user so the DTO mapper can populate
    // appointmentDoctorName without triggering N+1 lazy loads per row.
    @Query("""
        SELECT i FROM Invoice i
        LEFT JOIN FETCH i.appointment a
        LEFT JOIN FETCH a.doctor d
        LEFT JOIN FETCH d.user
        WHERE i.patient.id = :patientId
          AND i.hospital.id = :hospitalId
          AND i.appointment IS NOT NULL
          AND i.admission IS NULL
          AND i.status NOT IN (
              com.zenlocare.clinics.entity.InvoiceStatus.PAID,
              com.zenlocare.clinics.entity.InvoiceStatus.SETTLED,
              com.zenlocare.clinics.entity.InvoiceStatus.CANCELLED)
        ORDER BY i.createdAt DESC
    """)
    List<Invoice> findOpenOpdInvoicesForPatient(
            @Param("hospitalId") UUID hospitalId,
            @Param("patientId") Integer patientId);

    @Query("""
        SELECT CASE WHEN COUNT(ii) > 0 THEN TRUE ELSE FALSE END
        FROM Invoice inv JOIN inv.items ii
        WHERE inv.patient.id = :patientId AND ii.itemType = 'REGISTRATION'
        """)
    boolean existsRegistrationFeeForPatient(@Param("patientId") Integer patientId);

    // Quick check used by the labs-side radiology auto-bill flow (HMS no
    // longer auto-bills radiology). Returns true if any invoice item anywhere
    // already references this radiology order id — guards the labs integration
    // from double-billing into invoice_items.
    @Query("""
        SELECT CASE WHEN COUNT(ii) > 0 THEN TRUE ELSE FALSE END
        FROM InvoiceItem ii
        WHERE ii.radiologyOrderId = :radiologyOrderId
        """)
    boolean existsItemByRadiologyOrderId(@Param("radiologyOrderId") Long radiologyOrderId);

    /**
     * Returns all IPD invoices (linked to an admission) that are unpaid/unsettled
     * and have a zero or null total — candidates for estimate sync.
     */
    @Query("""
        SELECT i FROM Invoice i
        WHERE i.admission IS NOT NULL
        AND i.status IN (com.zenlocare.clinics.entity.InvoiceStatus.UNPAID, com.zenlocare.clinics.entity.InvoiceStatus.UNSETTLED, com.zenlocare.clinics.entity.InvoiceStatus.PARTIAL)
        AND (i.total IS NULL OR i.total = 0)
        """)
    List<Invoice> findZeroPendingIpdInvoices();

    // OPD invoice search — no status filter (used for the "ALL" tab). The previous
    // single-query approach with `CAST(i.status AS string) = :status` was broken
    // because `status` is stored as an Integer via InvoiceStatusConverter, so the
    // cast yielded "1"/"2"/... and never matched names like "UNPAID".
    // JOIN FETCH the to-one associations that InvoiceService.toDTO() reads for every
    // row (patient, updatedBy, appointment chain) so the page load doesn't trigger a
    // lazy-load round trip per invoice (was: ~6-8 extra queries x page size). The
    // `items` collection is intentionally NOT fetch-joined here — joining a
    // @OneToMany defeats pagination (Hibernate would have to load every matching
    // row into memory first); it's loaded in one batched IN query instead via
    // Invoice.items' @BatchSize. Count queries reuse the same `p` alias without
    // FETCH (fetch joins aren't valid in COUNT queries).
    @Query(value = """
        SELECT i FROM Invoice i
        LEFT JOIN FETCH i.patient p
        LEFT JOIN FETCH i.updatedBy
        LEFT JOIN FETCH i.appointment a
        LEFT JOIN FETCH a.createdBy
        LEFT JOIN FETCH a.doctor d
        LEFT JOIN FETCH d.user
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NULL
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        ORDER BY i.createdAt DESC
        """,
        countQuery = """
        SELECT COUNT(i) FROM Invoice i
        LEFT JOIN i.patient p
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NULL
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        """)
    Page<Invoice> searchOpdInvoices(
        @Param("hospitalId") UUID hospitalId,
        @Param("search") String search,
        Pageable pageable
    );

    @Query(value = """
        SELECT i FROM Invoice i
        LEFT JOIN FETCH i.patient p
        LEFT JOIN FETCH i.updatedBy
        LEFT JOIN FETCH i.appointment a
        LEFT JOIN FETCH a.createdBy
        LEFT JOIN FETCH a.doctor d
        LEFT JOIN FETCH d.user
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NULL
        AND i.status IN :statuses
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        ORDER BY i.createdAt DESC
        """,
        countQuery = """
        SELECT COUNT(i) FROM Invoice i
        LEFT JOIN i.patient p
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NULL
        AND i.status IN :statuses
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        """)
    Page<Invoice> searchOpdInvoicesByStatuses(
        @Param("hospitalId") UUID hospitalId,
        @Param("statuses") Collection<InvoiceStatus> statuses,
        @Param("search") String search,
        Pageable pageable
    );

    @Query(value = """
        SELECT i FROM Invoice i
        LEFT JOIN FETCH i.patient p
        LEFT JOIN FETCH i.admission
        LEFT JOIN FETCH i.updatedBy
        LEFT JOIN FETCH i.appointment a
        LEFT JOIN FETCH a.createdBy
        LEFT JOIN FETCH a.doctor d
        LEFT JOIN FETCH d.user
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NOT NULL
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        ORDER BY i.createdAt DESC
        """,
        countQuery = """
        SELECT COUNT(i) FROM Invoice i
        LEFT JOIN i.patient p
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NOT NULL
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        """)
    Page<Invoice> searchIpdInvoices(
        @Param("hospitalId") UUID hospitalId,
        @Param("search") String search,
        Pageable pageable
    );

    @Query(value = """
        SELECT i FROM Invoice i
        LEFT JOIN FETCH i.patient p
        LEFT JOIN FETCH i.admission
        LEFT JOIN FETCH i.updatedBy
        LEFT JOIN FETCH i.appointment a
        LEFT JOIN FETCH a.createdBy
        LEFT JOIN FETCH a.doctor d
        LEFT JOIN FETCH d.user
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NOT NULL
        AND i.status IN :statuses
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        ORDER BY i.createdAt DESC
        """,
        countQuery = """
        SELECT COUNT(i) FROM Invoice i
        LEFT JOIN i.patient p
        WHERE i.hospital.id = :hospitalId
        AND i.admission IS NOT NULL
        AND i.status IN :statuses
        AND (
            LOWER(i.invoiceNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(p.firstName, ' ', p.lastName))
                LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(p.uhid) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        """)
    Page<Invoice> searchIpdInvoicesByStatuses(
        @Param("hospitalId") UUID hospitalId,
        @Param("statuses") Collection<InvoiceStatus> statuses,
        @Param("search") String search,
        Pageable pageable
    );
}
