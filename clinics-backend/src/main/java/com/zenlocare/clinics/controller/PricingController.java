package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.PriceListDto;
import com.zenlocare.clinics.dto.PriceListItemDto;
import com.zenlocare.clinics.dto.PriceListItemRequest;
import com.zenlocare.clinics.dto.PriceListRequest;
import com.zenlocare.clinics.service.PricingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/pricing")
@RequiredArgsConstructor
public class PricingController {

    private final PricingService pricingService;

    // Price Lists
    @GetMapping("/hospital/{hospitalId}")
    public ResponseEntity<List<PriceListDto>> getHospitalPriceLists(@PathVariable UUID hospitalId) {
        return ResponseEntity.ok(pricingService.getPriceListsByHospital(hospitalId));
    }

    @PostMapping("/lists")
    public ResponseEntity<PriceListDto> createPriceList(@RequestBody PriceListRequest request) {
        return ResponseEntity.ok(pricingService.createPriceList(request));
    }

    @PutMapping("/lists/{id}")
    public ResponseEntity<PriceListDto> updatePriceList(@PathVariable UUID id, @RequestBody PriceListRequest request) {
        return ResponseEntity.ok(pricingService.updatePriceList(id, request));
    }

    @DeleteMapping("/lists/{id}")
    public ResponseEntity<Void> deletePriceList(@PathVariable UUID id) {
        pricingService.deletePriceList(id);
        return ResponseEntity.noContent().build();
    }

    // Price List Items
    @GetMapping("/lists/{priceListId}/items")
    public ResponseEntity<List<PriceListItemDto>> getPriceListItems(@PathVariable UUID priceListId) {
        return ResponseEntity.ok(pricingService.getItemsByPriceList(priceListId));
    }

    @PostMapping("/items")
    public ResponseEntity<PriceListItemDto> createPriceListItem(@RequestBody PriceListItemRequest request) {
        return ResponseEntity.ok(pricingService.createPriceListItem(request));
    }

    @PutMapping("/items/{id}")
    public ResponseEntity<PriceListItemDto> updatePriceListItem(@PathVariable UUID id,
            @RequestBody PriceListItemRequest request) {
        return ResponseEntity.ok(pricingService.updatePriceListItem(id, request));
    }

    @DeleteMapping("/items/{id}")
    public ResponseEntity<Void> deletePriceListItem(@PathVariable UUID id) {
        pricingService.deletePriceListItem(id);
        return ResponseEntity.noContent().build();
    }
}
