package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.RoomTypeConfig;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.RoomTypeConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RoomTypeConfigService {

    private final RoomTypeConfigRepository repo;
    private final HospitalRepository hospitalRepo;

    /** Returns all active types: system-wide + hospital-specific */
    public List<RoomTypeConfig> getAll(UUID hospitalId) {
        return repo.findActiveByHospitalId(hospitalId);
    }

    /** Create a new custom room type for a specific hospital */
    @Transactional
    public RoomTypeConfig create(UUID hospitalId, String code, String label, String category,
                                  String icon, String color, Boolean hasBeds, Boolean hasDailyCharge,
                                  Boolean bookableOt) {
        if (repo.existsByHospitalIdAndCode(hospitalId, code)) {
            throw new RuntimeException("Room type code '" + code + "' already exists");
        }
        Hospital hospital = hospitalRepo.getReferenceById(hospitalId);
        String cat = category != null ? category : "WARD";
        // Default: a new OT-category type is assumed a bookable theatre unless
        // stated otherwise; non-OT types are never bookable for surgery.
        boolean bookable = bookableOt != null ? bookableOt : "OT".equalsIgnoreCase(cat);
        return repo.save(RoomTypeConfig.builder()
                .hospital(hospital)
                .code(code.toUpperCase().replaceAll("[^A-Z0-9_]", "_"))
                .label(label)
                .category(cat)
                .icon(icon)
                .color(color)
                .hasBeds(hasBeds != null ? hasBeds : true)
                .hasDailyCharge(hasDailyCharge != null ? hasDailyCharge : true)
                .bookableOt(bookable)
                .isSystem(false)
                .isActive(true)
                .build());
    }

    /** Update an existing custom room type (system types can only update label/color) */
    @Transactional
    public RoomTypeConfig update(UUID id, String label, String category, String icon, String color,
                                 Boolean hasBeds, Boolean hasDailyCharge, Boolean bookableOt) {
        RoomTypeConfig config = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Room type config not found"));
        if (label != null) config.setLabel(label);
        if (!Boolean.TRUE.equals(config.getIsSystem())) {
            // Only non-system types can change category
            if (category != null) config.setCategory(category);
        }
        if (icon != null) config.setIcon(icon);
        if (color != null) config.setColor(color);
        if (hasBeds != null) config.setHasBeds(hasBeds);
        if (hasDailyCharge != null) config.setHasDailyCharge(hasDailyCharge);
        // bookable_ot is editable even on system types (a hospital may not
        // schedule surgeries in its Cath Lab, etc.).
        if (bookableOt != null) config.setBookableOt(bookableOt);
        return repo.save(config);
    }

    /** Soft-delete a custom room type. System types cannot be deleted. */
    @Transactional
    public void delete(UUID id) {
        RoomTypeConfig config = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Room type config not found"));
        if (Boolean.TRUE.equals(config.getIsSystem())) {
            throw new RuntimeException("System room types cannot be deleted");
        }
        config.setIsActive(false);
        repo.save(config);
    }
}
