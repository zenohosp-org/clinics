package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.InvoiceClaim;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvoiceClaimRepository extends JpaRepository<InvoiceClaim, UUID> {

    List<InvoiceClaim> findByHospitalIdOrderByCreatedAtDesc(UUID hospitalId);

    List<InvoiceClaim> findByHospitalIdAndStatusOrderByCreatedAtDesc(UUID hospitalId, String status);

    Optional<InvoiceClaim> findByIdAndHospitalId(UUID id, UUID hospitalId);

    // Claims still waiting on someone (ball not yet resolved). Used by the aging
    // job to scan for stale pending claims across all hospitals.
    List<InvoiceClaim> findByPendingWithNot(String pendingWith);

    // "Open" = anything a new claim on the same invoice would conflict with.
    // DENIED and SETTLED are resolution states; everything else is in flight.
    @Query("""
            SELECT COUNT(c) FROM InvoiceClaim c
            WHERE c.invoiceId = :invoiceId AND c.hospitalId = :hospitalId
              AND c.status NOT IN ('DENIED', 'SETTLED')
            """)
    long countOpenByInvoice(@Param("invoiceId") UUID invoiceId, @Param("hospitalId") UUID hospitalId);
}
