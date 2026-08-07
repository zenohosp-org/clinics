package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.AdmissionStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class AdmissionStatusConverter implements AttributeConverter<AdmissionStatus, Integer> {

    @Override
    public Integer convertToDatabaseColumn(AdmissionStatus status) {
        return status == null ? null : status.id;
    }

    @Override
    public AdmissionStatus convertToEntityAttribute(Integer id) {
        return id == null ? null : AdmissionStatus.fromId(id);
    }
}
