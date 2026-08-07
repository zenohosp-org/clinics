package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.Doctor;
import com.zenlocare.clinics.entity.DoctorAvailability;
import com.zenlocare.clinics.repository.DoctorAvailabilityRepository;
import com.zenlocare.clinics.repository.DoctorRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/doctors/{doctorId}/availability")
@RequiredArgsConstructor
public class DoctorAvailabilityController {

    private final DoctorAvailabilityRepository availabilityRepo;
    private final DoctorRepository doctorRepo;

    @GetMapping
    public ResponseEntity<List<AvailabilityDto>> list(@PathVariable UUID doctorId) {
        List<DoctorAvailability> rows = availabilityRepo.findByDoctorIdOrderByDayOfWeek(doctorId);
        return ResponseEntity.ok(rows.stream().map(this::toDto).collect(Collectors.toList()));
    }

    @PostMapping
    public ResponseEntity<AvailabilityDto> upsert(@PathVariable UUID doctorId,
                                                   @RequestBody AvailabilityDto req) {
        Doctor doctor = doctorRepo.getReferenceById(doctorId);
        DoctorAvailability row = availabilityRepo
                .findByDoctorIdAndDayOfWeek(doctorId, req.getDayOfWeek())
                .orElse(DoctorAvailability.builder().doctor(doctor).dayOfWeek(req.getDayOfWeek()).build());

        row.setStartTime(req.getStartTime() != null ? LocalTime.parse(req.getStartTime()) : null);
        row.setEndTime(req.getEndTime() != null ? LocalTime.parse(req.getEndTime()) : null);
        row.setSlotDurationMins(req.getSlotDurationMins());
        row.setMaxDailySlots(req.getMaxDailySlots());
        row.setIsActive(req.getIsActive() != null ? req.getIsActive() : true);

        return ResponseEntity.ok(toDto(availabilityRepo.save(row)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID doctorId, @PathVariable UUID id) {
        availabilityRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private AvailabilityDto toDto(DoctorAvailability a) {
        AvailabilityDto dto = new AvailabilityDto();
        dto.setId(a.getId());
        dto.setDoctorId(a.getDoctor().getId());
        dto.setDayOfWeek(a.getDayOfWeek());
        dto.setStartTime(a.getStartTime() != null ? a.getStartTime().toString() : null);
        dto.setEndTime(a.getEndTime() != null ? a.getEndTime().toString() : null);
        dto.setSlotDurationMins(a.getSlotDurationMins());
        dto.setMaxDailySlots(a.getMaxDailySlots());
        dto.setIsActive(a.getIsActive());
        return dto;
    }

    @Data
    public static class AvailabilityDto {
        private UUID id;
        private UUID doctorId;
        private Integer dayOfWeek;   // 0=Mon … 6=Sun
        private String startTime;    // "HH:mm"
        private String endTime;      // "HH:mm"
        private Integer slotDurationMins;
        private Integer maxDailySlots;
        private Boolean isActive;
    }
}
