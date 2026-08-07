package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.HistoryType;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class HistoryTypeConverter implements AttributeConverter<HistoryType, Integer> {

    @Override
    public Integer convertToDatabaseColumn(HistoryType type) {
        return type == null ? null : type.id;
    }

    @Override
    public HistoryType convertToEntityAttribute(Integer id) {
        return id == null ? null : HistoryType.fromId(id);
    }
}
