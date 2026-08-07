package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.PrescriptionFrequency;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class PrescriptionFrequencyConverter implements AttributeConverter<PrescriptionFrequency, Integer> {

    @Override
    public Integer convertToDatabaseColumn(PrescriptionFrequency f) {
        return f == null ? null : f.id;
    }

    @Override
    public PrescriptionFrequency convertToEntityAttribute(Integer id) {
        return id == null ? null : PrescriptionFrequency.fromId(id);
    }
}
