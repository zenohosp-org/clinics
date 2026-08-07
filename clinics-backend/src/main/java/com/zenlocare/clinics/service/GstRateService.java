package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.GstRateDTO;
import com.zenlocare.clinics.dto.GstRateRequest;
import com.zenlocare.clinics.entity.GstRate;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.repository.GstRateRepository;
import com.zenlocare.clinics.repository.HospitalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class GstRateService {

    private final GstRateRepository gstRateRepository;
    private final HospitalRepository hospitalRepository;

    public List<GstRateDTO> getAll(UUID hospitalId) {
        return gstRateRepository.findAllByOrderByRatePercentAsc()
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    public List<GstRateDTO> getActive(UUID hospitalId) {
        return gstRateRepository.findByIsActiveTrueOrderByRatePercentAsc()
                .stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional
    public GstRateDTO create(GstRateRequest req) {
        if (Boolean.TRUE.equals(req.getIsDefault())) {
            clearExistingDefault();
        }

        GstRate rate = GstRate.builder()
                .name(req.getName())
                .ratePercent(req.getRatePercent())
                .cgstPercent(orZero(req.getCgstPercent()))
                .sgstPercent(orZero(req.getSgstPercent()))
                .igstPercent(orZero(req.getIgstPercent()))
                .cessPercent(orZero(req.getCessPercent()))
                .isDefault(Boolean.TRUE.equals(req.getIsDefault()))
                .build();
        return toDTO(gstRateRepository.save(rate));
    }

    @Transactional
    public GstRateDTO update(UUID id, GstRateRequest req) {
        GstRate rate = gstRateRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("GST rate not found"));

        if (Boolean.TRUE.equals(req.getIsDefault()) && !Boolean.TRUE.equals(rate.getIsDefault())) {
            clearExistingDefault();
        }

        rate.setName(req.getName());
        rate.setRatePercent(req.getRatePercent());
        rate.setCgstPercent(orZero(req.getCgstPercent()));
        rate.setSgstPercent(orZero(req.getSgstPercent()));
        rate.setIgstPercent(orZero(req.getIgstPercent()));
        rate.setCessPercent(orZero(req.getCessPercent()));
        if (req.getIsDefault() != null) {
            rate.setIsDefault(req.getIsDefault());
        }
        return toDTO(gstRateRepository.save(rate));
    }

    @Transactional
    public GstRateDTO toggle(UUID id) {
        GstRate rate = gstRateRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("GST rate not found"));
        rate.setIsActive(!rate.getIsActive());
        return toDTO(gstRateRepository.save(rate));
    }

    @Transactional
    public GstRateDTO setDefault(UUID id) {
        GstRate rate = gstRateRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("GST rate not found"));
        clearExistingDefault();
        rate.setIsDefault(true);
        return toDTO(gstRateRepository.save(rate));
    }

    @Transactional
    public void delete(UUID id) {
        gstRateRepository.deleteById(id);
    }

    private void clearExistingDefault() {
        gstRateRepository.findByIsDefaultTrue()
                .forEach(r -> {
                    r.setIsDefault(false);
                    gstRateRepository.save(r);
                });
    }

    private BigDecimal orZero(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    public GstRateDTO toDTO(GstRate r) {
        return GstRateDTO.builder()
                .id(r.getId())
                .name(r.getName())
                .ratePercent(r.getRatePercent())
                .cgstPercent(r.getCgstPercent())
                .sgstPercent(r.getSgstPercent())
                .igstPercent(r.getIgstPercent())
                .cessPercent(r.getCessPercent())
                .isDefault(r.getIsDefault())
                .isActive(r.getIsActive())
                .build();
    }
}
