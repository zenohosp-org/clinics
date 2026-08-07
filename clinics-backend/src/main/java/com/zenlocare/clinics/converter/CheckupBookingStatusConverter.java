package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.CheckupBookingStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class CheckupBookingStatusConverter implements AttributeConverter<CheckupBookingStatus, Integer> {

    @Override
    public Integer convertToDatabaseColumn(CheckupBookingStatus status) {
        return status == null ? null : status.id;
    }

    @Override
    public CheckupBookingStatus convertToEntityAttribute(Integer id) {
        return id == null ? null : CheckupBookingStatus.fromId(id);
    }
}
