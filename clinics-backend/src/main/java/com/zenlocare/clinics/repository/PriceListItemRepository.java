package com.zenlocare.clinics.repository;

import com.zenlocare.clinics.entity.PriceListItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PriceListItemRepository extends JpaRepository<PriceListItem, UUID> {
    List<PriceListItem> findByPriceListId(UUID priceListId);

    Optional<PriceListItem> findByIdAndPriceListId(UUID id, UUID priceListId);
}
