package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PatientAdvance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PatientAdvanceRepository extends JpaRepository<PatientAdvance, UUID> {

    List<PatientAdvance> findByPatient_Id(Integer patientId);

    // Floating registration advances — not yet linked to any admission
    List<PatientAdvance> findByPatient_IdAndAdmission_IdIsNullAndAppliedFalse(Integer patientId);

    List<PatientAdvance> findByAdmission_Id(UUID admissionId);

    List<PatientAdvance> findByAdmission_IdAndAppliedFalse(UUID admissionId);

    long countByPatient_Id(Integer patientId);
}
