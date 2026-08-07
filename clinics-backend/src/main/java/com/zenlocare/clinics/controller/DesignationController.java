package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.DesignationDTO;
import com.zenlocare.clinics.dto.DesignationRequest;
import com.zenlocare.clinics.service.DesignationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/designations")
@RequiredArgsConstructor
public class DesignationController {

    private final DesignationService designationService;

    @GetMapping
    public ResponseEntity<List<DesignationDTO>> getAll(@RequestParam UUID hospitalId,
                                                        @RequestParam(defaultValue = "false") boolean activeOnly,
                                                        @RequestParam(required = false) UUID departmentId) {
        if (departmentId != null) {
            return ResponseEntity.ok(designationService.getByDepartment(hospitalId, departmentId));
        }
        return ResponseEntity.ok(activeOnly
                ? designationService.getActive(hospitalId)
                : designationService.getAll(hospitalId));
    }

    @PostMapping
    public ResponseEntity<DesignationDTO> create(@RequestBody DesignationRequest req) {
        return ResponseEntity.ok(designationService.create(req));
    }

    @PatchMapping("/{id}/toggle")
    public ResponseEntity<DesignationDTO> toggle(@PathVariable UUID id) {
        return ResponseEntity.ok(designationService.toggle(id));
    }
}
