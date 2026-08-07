package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.AppointmentVitals;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AppointmentVitalsRepository extends JpaRepository<AppointmentVitals, UUID> {
    Optional<AppointmentVitals> findByAppointmentId(UUID appointmentId);

    /**
     * Dashboard polls this to badge appointments that already have vitals
     * recorded so the doctor sees at a glance who's ready to be seen.
     */
    List<AppointmentVitals> findByHospitalId(UUID hospitalId);

    /**
     * For the consultation modal's "previous reading" comparison — last N
     * recordings for one patient, newest first. The consultation modal
     * fetches the most recent one to show a delta for follow-up visits.
     */
    List<AppointmentVitals> findTop5ByPatientIdAndHospitalIdOrderByRecordedAtDesc(
            Integer patientId, UUID hospitalId);
}
