package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.service.InfrastructureService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import com.zenlocare.clinics.exception.InfrastructureValidationException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/ipd/infrastructure")
@RequiredArgsConstructor
public class InfrastructureController {

    private final InfrastructureService service;

    @GetMapping
    public ResponseEntity<List<BuildingDto>> get(
            @RequestParam UUID hospitalId,
            @RequestParam(required = false, defaultValue = "false") boolean includeInactive) {
        return ResponseEntity.ok(service.get(hospitalId, includeInactive));
    }

    @PostMapping
    public ResponseEntity<List<BuildingDto>> save(
            @RequestParam UUID hospitalId,
            @RequestBody List<BuildingDto> buildings) {
        return ResponseEntity.ok(service.save(hospitalId, buildings));
    }

    @Data
    public static class BuildingDto {
        private Long id;
        private String name;
        private Boolean isActive;
        private List<FloorDto> floors = List.of();
    }

    @Data
    public static class FloorDto {
        private Long id;
        private String name;
        private Boolean isActive;
        private List<WardDto> wards = List.of();
    }

    @Data
    public static class WardDto {
        private Long id;
        private String name;
        private Boolean isActive;
        private String roomType;
        private java.math.BigDecimal dailyCharge;
        private List<RoomDto> rooms = List.of();
        private List<String> bedNames = List.of();
        private List<InfraBedDto> beds = List.of();
    }

    @Data
    public static class RoomDto {
        private Long id;
        private String name;
        private Boolean isActive;
        private List<String> bedNames = List.of();
        private List<InfraBedDto> beds = List.of();
    }

    @Data
    public static class InfraBedDto {
        private Long id;
        private String name;
    }

    @Data
    public static class ValidationRequest {
        private List<Long> roomIds = List.of();
        private List<Long> bedIds = List.of();
    }

    @Data
    public static class ValidationResponse {
        private boolean blocked;
        private List<String> reasons = List.of();
        private List<String> warnings = List.of();
    }

    @PostMapping("/validate-removal")
    public ResponseEntity<ValidationResponse> validateRemoval(@RequestBody ValidationRequest request) {
        return ResponseEntity.ok(service.validateRemoval(request));
    }

    @ExceptionHandler(InfrastructureValidationException.class)
    public ResponseEntity<ValidationResponse> handleValidationException(InfrastructureValidationException ex) {
        ValidationResponse response = new ValidationResponse();
        response.setBlocked(ex.isBlocked());
        response.setReasons(ex.getReasons());
        response.setWarnings(ex.getWarnings());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(response);
    }
}
