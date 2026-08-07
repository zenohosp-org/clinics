package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.Appointment.AppointmentType;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import lombok.extern.slf4j.Slf4j;

@Converter
@Slf4j
public class AppointmentTypeConverter implements AttributeConverter<AppointmentType, Integer> {

    @Override
    public Integer convertToDatabaseColumn(AppointmentType type) {
        return type == null ? null : type.id;
    }

    @Override
    public AppointmentType convertToEntityAttribute(Integer id) {
        if (id == null) return null;
        try {
            return AppointmentType.fromId(id);
        } catch (IllegalArgumentException e) {
            // See AppointmentStatusConverter for the same rationale: throwing
            // out of a JPA converter cascades into a 500 from any list/dashboard
            // touching the bad row. Degrade to null + log instead.
            log.warn("Unknown AppointmentType id={} in DB; returning null", id);
            return null;
        }
    }
}
