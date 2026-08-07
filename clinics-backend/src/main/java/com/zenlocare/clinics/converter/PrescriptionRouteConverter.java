package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.PrescriptionRoute;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class PrescriptionRouteConverter implements AttributeConverter<PrescriptionRoute, Integer> {

    @Override
    public Integer convertToDatabaseColumn(PrescriptionRoute r) {
        return r == null ? null : r.id;
    }

    @Override
    public PrescriptionRoute convertToEntityAttribute(Integer id) {
        return id == null ? null : PrescriptionRoute.fromId(id);
    }
}
