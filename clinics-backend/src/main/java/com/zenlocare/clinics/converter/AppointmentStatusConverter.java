package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.Appointment.AppointmentStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import lombok.extern.slf4j.Slf4j;

@Converter
@Slf4j
public class AppointmentStatusConverter implements AttributeConverter<AppointmentStatus, Integer> {

    @Override
    public Integer convertToDatabaseColumn(AppointmentStatus status) {
        return status == null ? null : status.id;
    }

    @Override
    public AppointmentStatus convertToEntityAttribute(Integer id) {
        if (id == null) return null;
        try {
            return AppointmentStatus.fromId(id);
        } catch (IllegalArgumentException e) {
            // Some appointments table row carries a status_id outside the
            // enum's known range (legacy migration, manual SQL insert,
            // truncated mapping after an enum rename, etc.). Throwing here
            // surfaces as a 500 from the dashboard / appointments list and
            // takes the whole hospital offline for any user logged into it.
            // Degrade to null + a log line instead — the row stays visible,
            // breakdown queries silently drop the unknown bucket, and the
            // bad data is surfaced in logs so it can be cleaned up.
            log.warn("Unknown AppointmentStatus id={} in DB; returning null", id);
            return null;
        }
    }
}
