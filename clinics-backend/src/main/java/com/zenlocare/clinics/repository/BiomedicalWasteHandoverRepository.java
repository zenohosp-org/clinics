package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.BiomedicalWasteHandover;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BiomedicalWasteHandoverRepository extends JpaRepository<BiomedicalWasteHandover, UUID> {

    List<BiomedicalWasteHandover> findByHospital_IdOrderByHandoverDateDescCreatedAtDesc(UUID hospitalId);
}
