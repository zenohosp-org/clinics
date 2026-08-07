package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.FluidEntry;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FluidEntryRepository extends JpaRepository<FluidEntry, UUID> {

    @EntityGraph(attributePaths = {"recordedBy"})
    List<FluidEntry> findByAdmissionIdAndHospitalIdOrderByEntryTimeDesc(
            UUID admissionId, UUID hospitalId);

    Optional<FluidEntry> findByIdAndHospitalId(UUID id, UUID hospitalId);
}
