package com.zenlocare.clinics.dto;

import com.zenlocare.clinics.entity.PriceListItem;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
public class PriceListItemDto {
    private UUID id;
    private UUID priceListId;
    private PriceListItem.ItemType itemType;
    private UUID itemId;
    private String itemName;
    private BigDecimal price;
    private Boolean isActive;

    public static PriceListItemDto fromEntity(PriceListItem item) {
        return PriceListItemDto.builder()
                .id(item.getId())
                .priceListId(item.getPriceList().getId())
                .itemType(item.getItemType())
                .itemId(item.getItemId())
                .itemName(item.getItemName())
                .price(item.getPrice())
                .isActive(item.getIsActive())
                .build();
    }
}
