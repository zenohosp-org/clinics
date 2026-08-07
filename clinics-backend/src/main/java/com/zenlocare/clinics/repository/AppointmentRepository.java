package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Appointment;
import com.zenlocare.clinics.entity.Doctor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {

    List<Appointment> findByHospitalId(UUID hospitalId);

    @Query("SELECT a.status, COUNT(a) FROM Appointment a WHERE a.hospital.id = :hid GROUP BY a.status")
    List<Object[]> getStatusBreakdown(@Param("hid") UUID hospitalId);

    List<Appointment> findByHospitalIdAndApptDate(UUID hospitalId, LocalDate apptDate);

    List<Appointment> findByDoctorIdAndApptDate(UUID doctorId, LocalDate apptDate);

    List<Appointment> findByPatientIdOrderByApptDateDescApptTimeDesc(Integer patientId);

    Optional<Appointment> findByIdAndHospitalId(UUID id, UUID hospitalId);

    @Query("SELECT DISTINCT a.doctor FROM Appointment a WHERE a.patient.id = :patientId AND a.hospital.id = :hospitalId AND a.doctor IS NOT NULL " +
           "AND a.status NOT IN (" +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CANCELLED," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.NO_SHOW)")
    List<Doctor> findDistinctDoctorsByPatient(@Param("patientId") Integer patientId, @Param("hospitalId") UUID hospitalId);

    @Query("SELECT COUNT(a) FROM Appointment a WHERE a.doctor.id = :doctorId AND a.apptDate = :apptDate")
    Integer countByDoctorIdAndApptDate(@Param("doctorId") UUID doctorId, @Param("apptDate") LocalDate apptDate);

    /**
     * A doctor's still-live appointments (and followups) over a date range —
     * backs the cross-app leave-conflict warning the People/HR service shows
     * when an admin records leave for that doctor. Only statuses that a future
     * absence would actually disrupt are returned: COMPLETED / CANCELLED /
     * NO_SHOW / BILLED / EXPIRED can't be affected by leave and are excluded.
     * BETWEEN is inclusive on both bounds, matching leave from_date..to_date.
     * patient + doctor are fetched so the lean DTO mapping never triggers an
     * N+1 walk across the range.
     */
    @EntityGraph(attributePaths = {"patient", "doctor"})
    @Query("SELECT a FROM Appointment a WHERE a.doctor.id = :doctorId " +
           "AND a.apptDate BETWEEN :from AND :to " +
           "AND a.status IN (" +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.SCHEDULED," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CONFIRMED," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CHECKED_IN," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.IN_PROGRESS) " +
           "ORDER BY a.apptDate ASC, a.apptTime ASC")
    List<Appointment> findActiveByDoctorIdAndApptDateBetween(
            @Param("doctorId") UUID doctorId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    /**
     * Highest token currently assigned in the hospital's today-queue. Used to
     * pick the next number when an appointment transitions into a token-
     * eligible status. Returns null when the queue is empty (caller treats
     * null as zero → first token is 1).
     */
    @Query("SELECT MAX(a.tokenNumber) FROM Appointment a " +
           "WHERE a.hospital.id = :hospitalId AND a.apptDate = :apptDate AND a.tokenNumber IS NOT NULL")
    Integer findMaxTokenNumberByHospitalIdAndApptDate(
            @Param("hospitalId") UUID hospitalId, @Param("apptDate") LocalDate apptDate);

    /**
     * Today's appointments for a hospital, ordered by booking time (createdAt
     * ASC). Backs the "Refresh Tokens" operation — re-numbering walks this
     * list and assigns 1..N in arrival order.
     *
     * Fetches createdBy + doctor.user eagerly so any downstream DTO mapping
     * (or audit hook reading creator/doctor) won't blow up on a closed
     * session. createdBy.role and doctor.user.role are listed explicitly
     * because Spring Data's default @EntityGraph type is FETCH, which treats
     * anything NOT listed as LAZY — even when the entity itself maps the
     * field @ManyToOne(EAGER). Same trap that surfaced on PatientRecord.
     */
    @EntityGraph(attributePaths = {
            "createdBy", "createdBy.role",
            "doctor", "doctor.user", "doctor.user.role",
            "patient"})
    @Query("SELECT a FROM Appointment a WHERE a.hospital.id = :hospitalId AND a.apptDate = :apptDate " +
           "ORDER BY a.createdAt ASC")
    List<Appointment> findByHospitalIdAndApptDateOrderByCreatedAtAsc(
            @Param("hospitalId") UUID hospitalId, @Param("apptDate") LocalDate apptDate);

    /**
     * findById variant that eagerly hydrates the relations AppointmentDto.fromEntity
     * touches (patient, doctor.user, createdBy, hospital). Used by status-change
     * paths where the response is mapped through the DTO — without this, the
     * lazy doctor.user / createdBy proxies can trip a LazyInit on Role even
     * inside @Transactional when an auto-flush re-orders things. role is
     * listed explicitly for the same FETCH-vs-LOAD reason.
     */
    @EntityGraph(attributePaths = {
            "patient",
            "doctor", "doctor.user", "doctor.user.role",
            "createdBy", "createdBy.role",
            "hospital"})
    @Query("SELECT a FROM Appointment a WHERE a.id = :id")
    Optional<Appointment> findByIdWithRelations(@Param("id") UUID id);

    @Query("SELECT COUNT(a) FROM Appointment a WHERE a.doctor.id = :doctorId AND a.apptDate = :apptDate " +
           "AND a.status IN (" +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.SCHEDULED," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CONFIRMED," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CHECKED_IN," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.IN_PROGRESS) " +
           "AND ((a.apptTime <= :startTime AND a.apptEndTime > :startTime) " +
           "  OR (a.apptTime < :endTime AND a.apptEndTime >= :endTime) " +
           "  OR (a.apptTime >= :startTime AND a.apptEndTime <= :endTime))")
    long countOverlappingAppointments(
            @Param("doctorId") UUID doctorId,
            @Param("apptDate") LocalDate apptDate,
            @Param("startTime") LocalTime startTime,
            @Param("endTime") LocalTime endTime);

    @Query("SELECT COUNT(a) FROM Appointment a WHERE a.doctor.id = :doctorId AND a.apptDate = :apptDate " +
           "AND a.id != :excludeApptId " +
           "AND a.status IN (" +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.SCHEDULED," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CONFIRMED," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CHECKED_IN," +
           "  com.zenlocare.clinics.entity.Appointment.AppointmentStatus.IN_PROGRESS) " +
           "AND ((a.apptTime <= :startTime AND a.apptEndTime > :startTime) " +
           "  OR (a.apptTime < :endTime AND a.apptEndTime >= :endTime) " +
           "  OR (a.apptTime >= :startTime AND a.apptEndTime <= :endTime))")
    long countOverlappingAppointmentsExcludeSelf(
            @Param("doctorId") UUID doctorId,
            @Param("apptDate") LocalDate apptDate,
            @Param("startTime") LocalTime startTime,
            @Param("endTime") LocalTime endTime,
            @Param("excludeApptId") UUID excludeApptId);

    @Query(value = """
        SELECT a FROM Appointment a
        LEFT JOIN FETCH a.patient p
        LEFT JOIN FETCH a.doctor d
        LEFT JOIN FETCH d.user du
        LEFT JOIN FETCH a.createdBy cb
        WHERE a.hospital.id = :hospitalId
        AND (:doctorId IS NULL OR a.doctor.id = :doctorId)
        AND (:dateFilter = 'ALL'
             OR (:dateFilter = 'TODAY' AND a.apptDate = :today)
             OR (:dateFilter = 'UPCOMING' AND a.apptDate >= :today AND a.status NOT IN (
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.COMPLETED,
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CANCELLED,
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.NO_SHOW))
             OR (:dateFilter = 'COMPLETED' AND a.status = com.zenlocare.clinics.entity.Appointment.AppointmentStatus.COMPLETED)
             OR (:dateFilter = 'CANCELLED' AND a.status IN (
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CANCELLED,
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.NO_SHOW)))
        AND (
            LOWER(a.patient.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(a.patient.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(a.patient.firstName, ' ', a.patient.lastName)) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(a.patient.uhid) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.user.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(d.user.lastName) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        ORDER BY
            CASE WHEN :dateFilter = 'TODAY' THEN a.createdAt END ASC,
            a.apptDate DESC, a.apptTime DESC
        """,
        countQuery = """
        SELECT COUNT(a) FROM Appointment a
        WHERE a.hospital.id = :hospitalId
        AND (:doctorId IS NULL OR a.doctor.id = :doctorId)
        AND (:dateFilter = 'ALL'
             OR (:dateFilter = 'TODAY' AND a.apptDate = :today)
             OR (:dateFilter = 'UPCOMING' AND a.apptDate >= :today AND a.status NOT IN (
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.COMPLETED,
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CANCELLED,
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.NO_SHOW))
             OR (:dateFilter = 'COMPLETED' AND a.status = com.zenlocare.clinics.entity.Appointment.AppointmentStatus.COMPLETED)
             OR (:dateFilter = 'CANCELLED' AND a.status IN (
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.CANCELLED,
                   com.zenlocare.clinics.entity.Appointment.AppointmentStatus.NO_SHOW)))
        AND (
            LOWER(a.patient.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(a.patient.lastName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(CONCAT(a.patient.firstName, ' ', a.patient.lastName)) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(a.patient.uhid) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(a.doctor.user.firstName) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(a.doctor.user.lastName) LIKE LOWER(CONCAT('%', :search, '%'))
        )
        """)
    Page<Appointment> searchAppointments(
        @Param("hospitalId") UUID hospitalId,
        @Param("doctorId") UUID doctorId,
        @Param("dateFilter") String dateFilter,
        @Param("today") LocalDate today,
        @Param("search") String search,
        Pageable pageable
    );

    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE Appointment a SET a.status = com.zenlocare.clinics.entity.Appointment.AppointmentStatus.EXPIRED, a.updatedAt = :now WHERE a.status = com.zenlocare.clinics.entity.Appointment.AppointmentStatus.SCHEDULED AND (a.apptDate < :today OR (a.apptDate = :today AND a.apptTime < :currentTime))")
    int expirePastAppointments(@org.springframework.data.repository.query.Param("today") java.time.LocalDate today, @org.springframework.data.repository.query.Param("currentTime") java.time.LocalTime currentTime, @org.springframework.data.repository.query.Param("now") java.time.LocalDateTime now);
}
