package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.Store;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;
import java.util.UUID;
import java.util.List;

public interface StoreRepository extends JpaRepository<Store, UUID> {

    Optional<Store> findByRoomId(Long roomId);

    @Modifying
    @Transactional
    @Query("DELETE FROM Store s WHERE s.hospital.id = :hospitalId")
    void deleteByHospitalId(UUID hospitalId);

    @Modifying
    @Transactional
    @Query("DELETE FROM Store s WHERE s.roomId = :roomId")
    void deleteByRoomId(Long roomId);
}
