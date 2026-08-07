package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.ConsultationDraft;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConsultationDraftRepository extends JpaRepository<ConsultationDraft, UUID> {
    Optional<ConsultationDraft> findByAppointmentId(UUID appointmentId);
    List<ConsultationDraft> findByHospitalId(UUID hospitalId);

    @Modifying
    @Transactional
    void deleteByAppointmentId(UUID appointmentId);
}
