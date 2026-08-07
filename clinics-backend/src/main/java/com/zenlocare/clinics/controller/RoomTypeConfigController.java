package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.RoomTypeConfig;
import com.zenlocare.clinics.service.RoomTypeConfigService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/settings/room-types")
@RequiredArgsConstructor
public class RoomTypeConfigController {

    private final RoomTypeConfigService service;

    @GetMapping
    public ResponseEntity<List<RoomTypeDto>> getAll(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(
                service.getAll(hospitalId).stream().map(this::toDto).toList()
        );
    }

    @PostMapping
    public ResponseEntity<RoomTypeDto> create(@RequestParam UUID hospitalId,
                                               @RequestBody CreateRoomTypeRequest req) {
        RoomTypeConfig created = service.create(hospitalId, req.getCode(), req.getLabel(),
                req.getCategory(), req.getIcon(), req.getColor(), req.getHasBeds(),
                req.getHasDailyCharge(), req.getBookableOt());
        return ResponseEntity.ok(toDto(created));
    }

    @PutMapping("/{id}")
    public ResponseEntity<RoomTypeDto> update(@PathVariable UUID id,
                                               @RequestBody UpdateRoomTypeRequest req) {
        RoomTypeConfig updated = service.update(id, req.getLabel(), req.getCategory(),
                req.getIcon(), req.getColor(), req.getHasBeds(), req.getHasDailyCharge(),
                req.getBookableOt());
        return ResponseEntity.ok(toDto(updated));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    private RoomTypeDto toDto(RoomTypeConfig c) {
        RoomTypeDto dto = new RoomTypeDto();
        dto.setId(c.getId());
        dto.setCode(c.getCode());
        dto.setLabel(c.getLabel());
        dto.setCategory(c.getCategory());
        dto.setIcon(c.getIcon());
        dto.setColor(c.getColor());
        dto.setHasBeds(c.getHasBeds());
        dto.setHasDailyCharge(c.getHasDailyCharge());
        dto.setBookableOt(c.getBookableOt());
        dto.setIsSystem(c.getIsSystem());
        dto.setDisplayOrder(c.getDisplayOrder());
        return dto;
    }

    @Data
    public static class RoomTypeDto {
        private UUID id;
        private String code;
        private String label;
        private String category;
        private String icon;
        private String color;
        private Boolean hasBeds;
        private Boolean hasDailyCharge;
        private Boolean bookableOt;
        private Boolean isSystem;
        private Integer displayOrder;
    }

    @Data
    public static class CreateRoomTypeRequest {
        private String code;
        private String label;
        private String category;
        private String icon;
        private String color;
        private Boolean hasBeds;
        private Boolean hasDailyCharge;
        private Boolean bookableOt;
    }

    @Data
    public static class UpdateRoomTypeRequest {
        private String label;
        private String category;
        private String icon;
        private String color;
        private Boolean hasBeds;
        private Boolean hasDailyCharge;
        private Boolean bookableOt;
    }
}
