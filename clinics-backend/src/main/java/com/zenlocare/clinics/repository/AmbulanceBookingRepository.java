package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.AmbulanceBooking;
import com.zenlocare.clinics.entity.AmbulanceBookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface AmbulanceBookingRepository extends JpaRepository<AmbulanceBooking, Long> {

    List<AmbulanceBooking> findByHospital_IdOrderByCreatedAtDesc(UUID hospitalId);

    List<AmbulanceBooking> findByHospital_IdAndStatusOrderByCreatedAtDesc(UUID hospitalId, AmbulanceBookingStatus status);

    List<AmbulanceBooking> findByHospital_IdAndBookingDateOrderByBookingTimeAsc(UUID hospitalId, LocalDate date);

    @Query("SELECT COUNT(b) FROM AmbulanceBooking b WHERE b.hospital.id = :hospitalId AND b.bookingDate = :date")
    long countByHospitalIdAndDate(UUID hospitalId, LocalDate date);

    long countByHospital_IdAndStatus(UUID hospitalId, AmbulanceBookingStatus status);

    // Count of all non-cancelled bookings — used by the dashboard "total" widget.
    // Replaces `findByHospital_IdOrderByCreatedAtDesc().size()` which loaded
    // every row into memory just to call .size().
    @Query("SELECT COUNT(b) FROM AmbulanceBooking b " +
           "WHERE b.hospital.id = :hospitalId " +
           "AND b.status <> com.zenlocare.clinics.entity.AmbulanceBookingStatus.CANCELLED")
    long countActiveByHospitalId(UUID hospitalId);

    List<AmbulanceBooking> findByPatient_IdAndHospital_Id(Integer patientId, UUID hospitalId);

    /**
     * Eligible ambulance bookings for auto-merge into a patient's IPD bill.
     *
     * Match rule (admit-time):
     *   - same hospital that owns the booking
     *   - same patient
     *   - not already merged (idempotency)
     *   - not CANCELLED
     *
     * NOTE: previously also required `reachedToSameHospital = TRUE`. That flag
     * is set by an address-substring match at booking creation, which silently
     * fails on emergency bookings where destinationAddress is null/blank or
     * doesn't contain the hospital's saved address/city verbatim — emergency
     * patient came in, ambulance fee never reached the IPD bill. The flag was
     * also blank on legacy rows.
     *
     * The patient being admitted at THIS hospital is sufficient proof the
     * ambulance ended its trip here, regardless of how its destinationAddress
     * was typed. Cross-hospital false-positive risk is low because patient_id
     * is hospital-scoped — a patient_id can't legitimately appear at another
     * hospital. Staff can still manually unmerge via the existing tooling if
     * a wrong booking attaches.
     *
     * Ordered oldest-first so the audit trail lists earlier bookings first.
     */
    @Query("""
        SELECT b FROM AmbulanceBooking b
        WHERE b.hospital.id = :hospitalId
          AND b.patient.id = :patientId
          AND (b.mergedToIpd IS NULL OR b.mergedToIpd = FALSE)
          AND b.status <> com.zenlocare.clinics.entity.AmbulanceBookingStatus.CANCELLED
        ORDER BY b.createdAt ASC
    """)
    List<AmbulanceBooking> findEligibleForIpdMerge(
            @org.springframework.data.repository.query.Param("hospitalId") UUID hospitalId,
            @org.springframework.data.repository.query.Param("patientId") Integer patientId);
}
