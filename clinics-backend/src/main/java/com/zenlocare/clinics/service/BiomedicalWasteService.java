package com.zenlocare.clinics.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zenlocare.clinics.dto.BiomedicalWasteDtos;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Bio-medical-waste domain service — BMWM Rules 2016 daily category-wise
 * waste logging and handover-to-vendor manifests. Mirrors the
 * BloodBankService conventions: lookup-driven categories, hospital-scoped
 * queries, and a "batch" action (handover) that consumes pending records.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BiomedicalWasteService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final BiomedicalWasteLookupRepository lookupRepo;
    private final BiomedicalWasteLogRepository logRepo;
    private final BiomedicalWasteHandoverRepository handoverRepo;
    private final HospitalRepository hospitalRepository;
    private final UserRepository userRepository;

    // ───── Lookups ────────────────────────────────────────────────────

    public List<BiomedicalWasteDtos.LookupDto> listLookups(UUID hospitalId, String lookupType) {
        return lookupRepo.findActiveByHospitalIdAndType(hospitalId, lookupType).stream()
                .map(this::toLookupDto)
                .toList();
    }

    private BiomedicalWasteDtos.LookupDto toLookupDto(BiomedicalWasteLookup l) {
        return BiomedicalWasteDtos.LookupDto.builder()
                .id(l.getId())
                .lookupType(l.getLookupType())
                .code(l.getCode())
                .label(l.getLabel())
                .metadata(l.getMetadata())
                .displayOrder(l.getDisplayOrder())
                .isSystem(Boolean.TRUE.equals(l.getIsSystem()))
                .isActive(Boolean.TRUE.equals(l.getIsActive()))
                .build();
    }

    private Map<String, String> labelMap(UUID hospitalId, String lookupType) {
        Map<String, String> map = new LinkedHashMap<>();
        for (BiomedicalWasteLookup l : lookupRepo.findActiveByHospitalIdAndType(hospitalId, lookupType)) {
            map.put(l.getCode(), l.getLabel());
        }
        return map;
    }

    // ───── Logs ───────────────────────────────────────────────────────

    public List<BiomedicalWasteDtos.LogDto> listLogs(UUID hospitalId, LocalDate from, LocalDate to,
                                                      String categoryCode, String generationPointCode,
                                                      Boolean pending) {
        Map<String, String> categoryLabels = labelMap(hospitalId, "WASTE_CATEGORY");
        Map<String, String> pointLabels = labelMap(hospitalId, "GENERATION_POINT");
        boolean pendingOnly = Boolean.TRUE.equals(pending);
        return logRepo.filter(hospitalId, from, to, blank(categoryCode), blank(generationPointCode), pendingOnly)
                .stream()
                .map(entry -> toLogDto(entry, categoryLabels, pointLabels))
                .toList();
    }

    @Transactional
    public BiomedicalWasteDtos.LogDto createLog(UUID hospitalId, BiomedicalWasteDtos.LogRequest req, UUID userId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));
        validateLogRequest(req);
        User collectedBy = userId != null ? userRepository.findById(userId).orElse(null) : null;

        BiomedicalWasteLog entry = BiomedicalWasteLog.builder()
                .hospital(hospital)
                .logDate(req.getLogDate() != null ? req.getLogDate() : LocalDate.now())
                .categoryCode(req.getCategoryCode())
                .generationPointCode(req.getGenerationPointCode())
                .weightKg(req.getWeightKg())
                .bagCount(req.getBagCount())
                .collectedByUser(collectedBy)
                .notes(req.getNotes())
                .build();

        BiomedicalWasteLog saved = logRepo.save(entry);
        return toLogDto(saved, labelMap(hospitalId, "WASTE_CATEGORY"), labelMap(hospitalId, "GENERATION_POINT"));
    }

    @Transactional
    public BiomedicalWasteDtos.LogDto updateLog(UUID id, UUID hospitalId, BiomedicalWasteDtos.LogRequest req) {
        BiomedicalWasteLog entry = logRepo.findById(id)
                .filter(l -> l.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Waste log entry not found"));
        if (entry.getHandover() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This entry is already part of a handover and cannot be edited");
        }
        validateLogRequest(req);
        entry.setLogDate(req.getLogDate() != null ? req.getLogDate() : entry.getLogDate());
        entry.setCategoryCode(req.getCategoryCode());
        entry.setGenerationPointCode(req.getGenerationPointCode());
        entry.setWeightKg(req.getWeightKg());
        entry.setBagCount(req.getBagCount());
        entry.setNotes(req.getNotes());

        BiomedicalWasteLog saved = logRepo.save(entry);
        return toLogDto(saved, labelMap(hospitalId, "WASTE_CATEGORY"), labelMap(hospitalId, "GENERATION_POINT"));
    }

    @Transactional
    public void deleteLog(UUID id, UUID hospitalId) {
        BiomedicalWasteLog entry = logRepo.findById(id)
                .filter(l -> l.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Waste log entry not found"));
        if (entry.getHandover() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This entry is already part of a handover and cannot be deleted");
        }
        logRepo.delete(entry);
    }

    private void validateLogRequest(BiomedicalWasteDtos.LogRequest req) {
        if (req.getCategoryCode() == null || req.getCategoryCode().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "categoryCode is required");
        }
        if (req.getGenerationPointCode() == null || req.getGenerationPointCode().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "generationPointCode is required");
        }
        if (req.getWeightKg() == null || req.getWeightKg().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "weightKg must be greater than zero");
        }
    }

    private BiomedicalWasteDtos.LogDto toLogDto(BiomedicalWasteLog l, Map<String, String> categoryLabels,
                                                 Map<String, String> pointLabels) {
        User u = l.getCollectedByUser();
        String collectedByName = u != null
                ? u.getFirstName() + (u.getLastName() != null ? " " + u.getLastName() : "")
                : null;
        return BiomedicalWasteDtos.LogDto.builder()
                .id(l.getId())
                .logDate(l.getLogDate())
                .categoryCode(l.getCategoryCode())
                .categoryLabel(categoryLabels.getOrDefault(l.getCategoryCode(), l.getCategoryCode()))
                .generationPointCode(l.getGenerationPointCode())
                .generationPointLabel(pointLabels.getOrDefault(l.getGenerationPointCode(), l.getGenerationPointCode()))
                .weightKg(l.getWeightKg())
                .bagCount(l.getBagCount())
                .collectedByUserName(collectedByName)
                .notes(l.getNotes())
                .handoverId(l.getHandover() != null ? l.getHandover().getId() : null)
                .status(l.getHandover() != null ? "HANDED_OVER" : "PENDING")
                .createdAt(l.getCreatedAt())
                .build();
    }

    // ───── Stats ──────────────────────────────────────────────────────

    public BiomedicalWasteDtos.StatsDto getStats(UUID hospitalId) {
        LocalDate today = LocalDate.now();
        LocalDate weekStart = today.minusDays(today.getDayOfWeek().getValue() - 1);
        LocalDate monthStart = today.withDayOfMonth(1);

        Map<String, BigDecimal> pendingByCategory = new LinkedHashMap<>();
        for (Object[] row : logRepo.pendingByCategory(hospitalId)) {
            pendingByCategory.put((String) row[0], (BigDecimal) row[1]);
        }

        return BiomedicalWasteDtos.StatsDto.builder()
                .todayKg(logRepo.sumWeightByDate(hospitalId, today))
                .weekKg(logRepo.sumWeightBetween(hospitalId, weekStart, today))
                .monthKg(logRepo.sumWeightBetween(hospitalId, monthStart, today))
                .pendingKg(logRepo.sumPending(hospitalId))
                .pendingByCategory(pendingByCategory)
                .build();
    }

    // ───── Handovers ──────────────────────────────────────────────────

    public List<BiomedicalWasteDtos.HandoverDto> listHandovers(UUID hospitalId, LocalDate from, LocalDate to) {
        return handoverRepo.findByHospital_IdOrderByHandoverDateDescCreatedAtDesc(hospitalId).stream()
                .filter(h -> from == null || !h.getHandoverDate().isBefore(from))
                .filter(h -> to == null || !h.getHandoverDate().isAfter(to))
                .map(h -> toHandoverDto(h, (int) logRepo.countByHandover_Id(h.getId())))
                .toList();
    }

    public BiomedicalWasteDtos.HandoverDto getHandover(UUID id, UUID hospitalId) {
        BiomedicalWasteHandover handover = handoverRepo.findById(id)
                .filter(h -> h.getHospital().getId().equals(hospitalId))
                .orElseThrow(() -> new ResourceNotFoundException("Handover not found"));
        return toHandoverDto(handover, (int) logRepo.countByHandover_Id(handover.getId()));
    }

    @Transactional
    public BiomedicalWasteDtos.HandoverDto createHandover(UUID hospitalId, BiomedicalWasteDtos.HandoverRequest req, UUID userId) {
        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));
        if (req.getVendorName() == null || req.getVendorName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vendorName is required");
        }
        if (req.getLogIds() == null || req.getLogIds().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select at least one pending waste log entry");
        }

        List<BiomedicalWasteLog> entries = logRepo.findByIdInAndHospital_Id(req.getLogIds(), hospitalId);
        if (entries.size() != req.getLogIds().size()) {
            throw new ResourceNotFoundException("One or more waste log entries were not found");
        }
        for (BiomedicalWasteLog entry : entries) {
            if (entry.getHandover() != null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Entry dated " + entry.getLogDate() + " (" + entry.getCategoryCode()
                                + ") is already part of another handover");
            }
        }

        BigDecimal totalWeight = entries.stream()
                .map(BiomedicalWasteLog::getWeightKg)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, BigDecimal> breakdown = new LinkedHashMap<>();
        for (BiomedicalWasteLog entry : entries) {
            breakdown.merge(entry.getCategoryCode(), entry.getWeightKg(), BigDecimal::add);
        }

        String breakdownJson;
        try {
            breakdownJson = JSON.writeValueAsString(breakdown);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialize category breakdown", e);
        }

        User createdBy = userId != null ? userRepository.findById(userId).orElse(null) : null;

        BiomedicalWasteHandover handover = BiomedicalWasteHandover.builder()
                .hospital(hospital)
                .handoverDate(req.getHandoverDate() != null ? req.getHandoverDate() : LocalDate.now())
                .vendorName(req.getVendorName())
                .manifestNumber(req.getManifestNumber())
                .vehicleNumber(req.getVehicleNumber())
                .receivedByName(req.getReceivedByName())
                .totalWeightKg(totalWeight)
                .categoryBreakdown(breakdownJson)
                .costAmount(req.getCostAmount())
                .invoiceNumber(req.getInvoiceNumber())
                .notes(req.getNotes())
                .createdByUser(createdBy)
                .build();

        BiomedicalWasteHandover saved = handoverRepo.save(handover);

        for (BiomedicalWasteLog entry : entries) {
            entry.setHandover(saved);
        }
        logRepo.saveAll(entries);

        return toHandoverDto(saved, entries.size());
    }

    private BiomedicalWasteDtos.HandoverDto toHandoverDto(BiomedicalWasteHandover h, int logCount) {
        User u = h.getCreatedByUser();
        String createdByName = u != null
                ? u.getFirstName() + (u.getLastName() != null ? " " + u.getLastName() : "")
                : null;

        Map<String, BigDecimal> breakdown;
        try {
            breakdown = h.getCategoryBreakdown() == null
                    ? Map.of()
                    : JSON.readValue(h.getCategoryBreakdown(), new TypeReference<Map<String, BigDecimal>>() {});
        } catch (Exception e) {
            log.warn("Could not parse category breakdown for handover {}: {}", h.getId(), e.getMessage());
            breakdown = Map.of();
        }

        return BiomedicalWasteDtos.HandoverDto.builder()
                .id(h.getId())
                .handoverDate(h.getHandoverDate())
                .vendorName(h.getVendorName())
                .manifestNumber(h.getManifestNumber())
                .vehicleNumber(h.getVehicleNumber())
                .receivedByName(h.getReceivedByName())
                .totalWeightKg(h.getTotalWeightKg())
                .categoryBreakdown(breakdown)
                .costAmount(h.getCostAmount())
                .invoiceNumber(h.getInvoiceNumber())
                .notes(h.getNotes())
                .logCount(logCount)
                .createdByUserName(createdByName)
                .createdAt(h.getCreatedAt())
                .build();
    }

    // ───── Helpers ────────────────────────────────────────────────────

    private String blank(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
