package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.ZemaRule;
import com.zenlocare.clinics.repository.ZemaRuleRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/zema-rules")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('doctor', 'staff', 'hospital_admin', 'super_admin')")
public class ZemaRuleController {

    private final ZemaRuleRepository zemaRuleRepository;

    /**
     * Expose list of active Zema rules for a hospital (or system-wide defaults).
     * Accessible by doctor, staff, hospital_admin, super_admin.
     */
    @GetMapping
    @Transactional(readOnly = true)
    public ResponseEntity<List<ZemaRuleDto>> getRules(@RequestParam UUID hospitalId) {
        List<ZemaRuleDto> dtos = zemaRuleRepository.findActiveByHospitalId(hospitalId)
                .stream()
                .map(this::toDto)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    private ZemaRuleDto toDto(ZemaRule rule) {
        ZemaRuleDto dto = new ZemaRuleDto();
        dto.setRuleId(rule.getRuleId());
        dto.setHospitalId(rule.getHospital() != null ? rule.getHospital().getId() : null);
        dto.setRuleType(rule.getRuleType());
        dto.setMetric(rule.getMetric());
        dto.setOperator(rule.getOperator());
        dto.setThresholdLow(rule.getThresholdLow());
        dto.setThresholdHigh(rule.getThresholdHigh());
        dto.setConditionExpr(rule.getConditionExpr());
        dto.setLabel(rule.getLabel());
        dto.setOutputText(rule.getOutputText());
        dto.setSeverity(rule.getSeverity());
        dto.setIsActive(rule.getIsActive());
        dto.setSortHint(rule.getSortHint());
        return dto;
    }

    @Data
    public static class ZemaRuleDto {
        private UUID ruleId;
        private UUID hospitalId;
        private String ruleType;
        private String metric;
        private String operator;
        private BigDecimal thresholdLow;
        private BigDecimal thresholdHigh;
        private String conditionExpr;
        private String label;
        private String outputText;
        private String severity;
        private Boolean isActive;
        private Integer sortHint;
    }
}
