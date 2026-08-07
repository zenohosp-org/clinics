package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.PriceList;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
public class PriceListDto {
    private UUID id;
    private String name;
    private String description;
    private Boolean isDefault;
    private Boolean isActive;

    public static PriceListDto fromEntity(PriceList list) {
        return PriceListDto.builder()
                .id(list.getId())
                .name(list.getName())
                .description(list.getDescription())
                .isDefault(list.getIsDefault())
                .isActive(list.getIsActive())
                .build();
    }
}
