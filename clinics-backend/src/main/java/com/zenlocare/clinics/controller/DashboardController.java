package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.DashboardSummaryResponse;
import com.zenlocare.clinics.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.util.UUID;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/summary")
    public ResponseEntity<DashboardSummaryResponse> getSummary(@RequestParam UUID hospitalId) {
        return ResponseEntity.ok(dashboardService.getSummary(hospitalId));
    }
}
