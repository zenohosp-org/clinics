package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.InvoiceStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class InvoiceStatusConverter implements AttributeConverter<InvoiceStatus, Integer> {

    @Override
    public Integer convertToDatabaseColumn(InvoiceStatus status) {
        return status == null ? null : status.id;
    }

    @Override
    public InvoiceStatus convertToEntityAttribute(Integer id) {
        return id == null ? null : InvoiceStatus.fromId(id);
    }
}
