package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.InvoiceItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface InvoiceItemRepository extends JpaRepository<InvoiceItem, UUID> {

    // Cheap insurance for future server-side dedupe of OT lines. Not consumed
    // today — the IPD finalize modal still dedupes on the client — but lets a
    // background reconciler ask "has this OTM invoice item already been
    // mirrored into HMS?" without scanning every invoice.
    boolean existsByOtInvoiceItemId(UUID otInvoiceItemId);

    /**
     * Return-credit feed for finance — negative-priced lines on this
     * hospital's invoices that came from a pharmacy bill (i.e. credit notes
     * from ward returns that arrived via IPD Finalize). JOIN FETCH invoice +
     * patient so the row mapper stays N+1-free. Window is inclusive on both
     * ends ({@code [fromTs, toTs)}, half-open).
     */
    @Query("""
            SELECT ii FROM InvoiceItem ii
            JOIN FETCH ii.invoice i
            LEFT JOIN FETCH i.patient p
            WHERE i.hospital.id = :hospitalId
              AND ii.totalPrice < 0
              AND ii.pharmacyBillId IS NOT NULL
              AND ii.createdAt >= :fromTs
              AND ii.createdAt <  :toTs
            ORDER BY ii.createdAt DESC
            """)
    List<InvoiceItem> findReturnCreditsInWindow(
            @Param("hospitalId") UUID hospitalId,
            @Param("fromTs") LocalDateTime fromTs,
            @Param("toTs")   LocalDateTime toTs);
}
