package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "roles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 50)
    private String name; // "super_admin", "hospital_admin", "doctor", "staff"

    @PrePersist
    @PreUpdate
    public void normalizeCase() {
        if (name != null) {
            this.name = name.toLowerCase().trim();
        }
    }

    @Column(name = "display_name", length = 100)
    private String displayName; // "Super Admin", "Hospital Admin", "Doctor", "Staff"

    @Column(name = "is_system_role")
    @Builder.Default
    private Boolean isSystemRole = false;

    private String description;

    // Module Access Flags
    @Builder.Default
    @Column(name = "can_access_hms")
    private Boolean canAccessHms = false;

    @Builder.Default
    @Column(name = "can_access_asset")
    private Boolean canAccessAsset = false;

    @Builder.Default
    @Column(name = "can_access_inventory")
    private Boolean canAccessInventory = false;

    @Builder.Default
    @Column(name = "can_access_ot")
    private Boolean canAccessOt = false;

    @Builder.Default
    @Column(name = "can_access_pharmacy")
    private Boolean canAccessPharmacy = false;
}
