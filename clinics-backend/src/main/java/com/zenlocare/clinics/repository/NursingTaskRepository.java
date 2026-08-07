package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.NursingTask;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface NursingTaskRepository extends JpaRepository<NursingTask, UUID> {

    @EntityGraph(attributePaths = {"createdBy", "completedBy"})
    List<NursingTask> findByAdmissionIdAndHospitalIdOrderByCreatedAtDesc(
            UUID admissionId, UUID hospitalId);

    Optional<NursingTask> findByIdAndHospitalId(UUID id, UUID hospitalId);
}
