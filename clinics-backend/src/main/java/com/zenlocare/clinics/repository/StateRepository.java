package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.State;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface StateRepository extends JpaRepository<State, UUID> {
    List<State> findByIsActiveTrueOrderByDisplayOrderAsc();
}
