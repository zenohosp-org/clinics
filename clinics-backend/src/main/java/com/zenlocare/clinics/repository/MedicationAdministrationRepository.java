package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.MedicationAdministration;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MedicationAdministrationRepository extends JpaRepository<MedicationAdministration, UUID> {

    /**
     * All administration records for one admission, oldest-first (chronological
     * MAR order). EntityGraph eagerly fetches administeredBy so the controller's
     * DTO mapper can read the nurse's name without a session.
     */
    @EntityGraph(attributePaths = {"administeredBy"})
    List<MedicationAdministration> findByAdmissionIdOrderByAdministeredAtAsc(UUID admissionId);
}
