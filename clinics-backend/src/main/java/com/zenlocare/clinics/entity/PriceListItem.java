package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "price_list_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PriceListItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "price_list_id", nullable = false)
    private PriceList priceList;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false, length = 50)
    private ItemType itemType;

    @Column(name = "item_id")
    private UUID itemId; // Reference to specific Doctor or Room, nullable for generic items

    @Column(name = "item_name", nullable = false, length = 200)
    private String itemName; // Denormalized name for fast UI rendering

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    public enum ItemType {
        CONSULTATION,
        ROOM_RENT,
        OT_CHARGE,
        LAB_TEST,
        PROCEDURE,
        NURSING,
        OTHER
    }
}
