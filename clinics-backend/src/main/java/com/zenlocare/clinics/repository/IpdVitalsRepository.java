package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.IpdVitals;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface IpdVitalsRepository extends JpaRepository<IpdVitals, UUID> {

    // All readings for one IPD admission, newest first.
    // The composite index on (admission_id, recorded_at DESC) makes this fast.
    List<IpdVitals> findByAdmissionIdOrderByRecordedAtDesc(UUID admissionId);
}
