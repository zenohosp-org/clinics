package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Hospital;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface HospitalRepository extends JpaRepository<Hospital, UUID> {
    Optional<Hospital> findByCode(String code);

    Optional<Hospital> findByName(String name);
}
