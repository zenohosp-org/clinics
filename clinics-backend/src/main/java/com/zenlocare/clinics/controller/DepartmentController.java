package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.DepartmentDTO;
import com.zenlocare.clinics.dto.DepartmentRequest;
import com.zenlocare.clinics.service.DepartmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/departments")
@RequiredArgsConstructor
public class DepartmentController {

    private final DepartmentService departmentService;

    @GetMapping
    public ResponseEntity<List<DepartmentDTO>> getAll(@RequestParam UUID hospitalId,
                                                       @RequestParam(defaultValue = "false") boolean activeOnly) {
        return ResponseEntity.ok(activeOnly
                ? departmentService.getActive(hospitalId)
                : departmentService.getAll(hospitalId));
    }

    @PostMapping
    public ResponseEntity<DepartmentDTO> create(@RequestBody DepartmentRequest req) {
        return ResponseEntity.ok(departmentService.create(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<DepartmentDTO> update(@PathVariable UUID id, @RequestBody DepartmentRequest req) {
        return ResponseEntity.ok(departmentService.update(id, req));
    }

    @PatchMapping("/{id}/toggle")
    public ResponseEntity<DepartmentDTO> toggle(@PathVariable UUID id) {
        return ResponseEntity.ok(departmentService.toggle(id));
    }
}
