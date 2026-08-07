package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.PriceListDto;
import com.zenlocare.clinics.dto.PriceListItemDto;
import com.zenlocare.clinics.dto.PriceListItemRequest;
import com.zenlocare.clinics.dto.PriceListRequest;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.PriceList;
import com.zenlocare.clinics.entity.PriceListItem;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.PriceListItemRepository;
import com.zenlocare.clinics.repository.PriceListRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class PricingService {

    private final PriceListRepository priceListRepository;
    private final PriceListItemRepository priceListItemRepository;
    private final HospitalRepository hospitalRepository;

    public List<PriceListDto> getPriceListsByHospital(UUID hospitalId) {
        return priceListRepository.findByHospitalId(hospitalId).stream()
                .map(PriceListDto::fromEntity)
                .collect(Collectors.toList());
    }

    public PriceListDto getPriceList(UUID id, UUID hospitalId) {
        PriceList list = priceListRepository.findByIdAndHospitalId(id, hospitalId)
                .orElseThrow(() -> new RuntimeException("Price List not found"));
        return PriceListDto.fromEntity(list);
    }

    @Transactional
    public PriceListDto createPriceList(PriceListRequest request) {
        Hospital hospital = hospitalRepository.findById(request.getHospitalId())
                .orElseThrow(() -> new RuntimeException("Hospital not found"));

        // If setting as default, maybe unset others? Skipping complex logic for now.

        PriceList priceList = PriceList.builder()
                .hospital(hospital)
                .name(request.getName())
                .description(request.getDescription())
                .isDefault(request.getIsDefault() != null ? request.getIsDefault() : false)
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .build();

        return PriceListDto.fromEntity(priceListRepository.save(priceList));
    }

    @Transactional
    public PriceListDto updatePriceList(UUID id, PriceListRequest request) {
        PriceList priceList = priceListRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Price List not found"));

        if (request.getName() != null)
            priceList.setName(request.getName());
        if (request.getDescription() != null)
            priceList.setDescription(request.getDescription());
        if (request.getIsDefault() != null)
            priceList.setIsDefault(request.getIsDefault());
        if (request.getIsActive() != null)
            priceList.setIsActive(request.getIsActive());

        return PriceListDto.fromEntity(priceListRepository.save(priceList));
    }

    @Transactional
    public void deletePriceList(UUID id) {
        priceListRepository.deleteById(id);
    }

    // Items
    public List<PriceListItemDto> getItemsByPriceList(UUID priceListId) {
        return priceListItemRepository.findByPriceListId(priceListId).stream()
                .map(PriceListItemDto::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional
    public PriceListItemDto createPriceListItem(PriceListItemRequest request) {
        PriceList priceList = priceListRepository.findById(request.getPriceListId())
                .orElseThrow(() -> new RuntimeException("Price List not found"));

        PriceListItem item = PriceListItem.builder()
                .priceList(priceList)
                .itemType(request.getItemType())
                .itemId(request.getItemId())
                .itemName(request.getItemName())
                .price(request.getPrice())
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .build();

        return PriceListItemDto.fromEntity(priceListItemRepository.save(item));
    }

    @Transactional
    public PriceListItemDto updatePriceListItem(UUID id, PriceListItemRequest request) {
        PriceListItem item = priceListItemRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Item not found"));

        if (request.getItemType() != null)
            item.setItemType(request.getItemType());
        if (request.getItemId() != null)
            item.setItemId(request.getItemId());
        if (request.getItemName() != null)
            item.setItemName(request.getItemName());
        if (request.getPrice() != null)
            item.setPrice(request.getPrice());
        if (request.getIsActive() != null)
            item.setIsActive(request.getIsActive());

        return PriceListItemDto.fromEntity(priceListItemRepository.save(item));
    }

    @Transactional
    public void deletePriceListItem(UUID id) {
        priceListItemRepository.deleteById(id);
    }
}
