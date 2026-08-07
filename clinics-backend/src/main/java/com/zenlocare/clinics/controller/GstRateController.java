package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.GstRateDTO;
import com.zenlocare.clinics.dto.GstRateRequest;
import com.zenlocare.clinics.service.GstRateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/gst-rates")
@RequiredArgsConstructor
public class GstRateController {

    private final GstRateService gstRateService;

    @GetMapping
    public ResponseEntity<List<GstRateDTO>> getAll(@RequestParam(required = false) UUID hospitalId,
                                                     @RequestParam(defaultValue = "false") boolean activeOnly) {
        return ResponseEntity.ok(activeOnly
                ? gstRateService.getActive(null)
                : gstRateService.getAll(null));
    }

    @PostMapping
    public ResponseEntity<GstRateDTO> create(@RequestBody GstRateRequest req) {
        return ResponseEntity.ok(gstRateService.create(req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GstRateDTO> update(@PathVariable UUID id, @RequestBody GstRateRequest req) {
        return ResponseEntity.ok(gstRateService.update(id, req));
    }

    @PatchMapping("/{id}/toggle")
    public ResponseEntity<GstRateDTO> toggle(@PathVariable UUID id) {
        return ResponseEntity.ok(gstRateService.toggle(id));
    }

    @PatchMapping("/{id}/set-default")
    public ResponseEntity<GstRateDTO> setDefault(@PathVariable UUID id) {
        return ResponseEntity.ok(gstRateService.setDefault(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        gstRateService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
