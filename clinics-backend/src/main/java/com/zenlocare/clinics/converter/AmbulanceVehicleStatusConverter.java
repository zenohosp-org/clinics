package com.zenlocare.clinics.converter;

import com.zenlocare.clinics.entity.AmbulanceVehicleStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class AmbulanceVehicleStatusConverter implements AttributeConverter<AmbulanceVehicleStatus, Integer> {

    @Override
    public Integer convertToDatabaseColumn(AmbulanceVehicleStatus status) {
        return status == null ? null : status.id;
    }

    @Override
    public AmbulanceVehicleStatus convertToEntityAttribute(Integer id) {
        return id == null ? null : AmbulanceVehicleStatus.fromId(id);
    }
}
