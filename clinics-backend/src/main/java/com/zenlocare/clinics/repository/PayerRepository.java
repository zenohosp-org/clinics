package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Payer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PayerRepository extends JpaRepository<Payer, UUID> {

    List<Payer> findByHospitalIdOrderByNameAsc(UUID hospitalId);

    List<Payer> findByHospitalIdAndIsActiveTrueOrderByNameAsc(UUID hospitalId);

    Optional<Payer> findByIdAndHospitalId(UUID id, UUID hospitalId);

    boolean existsByHospitalIdAndNameIgnoreCase(UUID hospitalId, String name);
}
