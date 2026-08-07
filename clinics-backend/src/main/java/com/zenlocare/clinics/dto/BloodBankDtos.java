package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Holder for the blood-bank wire shapes. Grouped so the controller's
 * import list stays small and the DTOs live next to each other for
 * reviewer-friendly diffs.
 */
public final class BloodBankDtos {

    private BloodBankDtos() {}

    // ─────── Lookups ───────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LookupDto {
        private UUID id;
        private String lookupType;
        private String code;
        private String label;
        private String metadata;
        private Integer displayOrder;
        private Boolean isSystem;
        private Boolean isActive;
    }

    // ─────── Donors ────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DonorDto {
        private UUID id;
        private UUID hospitalId;
        private String donorCode;
        private String firstName;
        private String lastName;
        private String phone;
        private String email;
        private LocalDate dob;
        private String gender;
        private String bloodGroupCode;
        private String donorTypeCode;
        private String address;
        private String aadhaarNumber;
        private Integer patientId;
        private Integer totalDonations;
        private LocalDate lastDonationDate;
        private Boolean isEligible;
        private String notes;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DonorRequest {
        private String firstName;
        private String lastName;
        private String phone;
        private String email;
        private LocalDate dob;
        private String gender;
        private String bloodGroupCode;
        private String donorTypeCode;
        private String address;
        private String aadhaarNumber;
        private Integer patientId;
        private Boolean isEligible;
        private String notes;
    }

    // ─────── Units ─────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UnitDto {
        private UUID id;
        private UUID hospitalId;
        private String bagNumber;
        private String bloodGroupCode;
        private String componentCode;
        private String statusCode;
        private String sourceCode;
        private UUID donorId;
        private String donorName;
        private String donorPhone;
        private Integer volumeMl;
        private LocalDate collectionDate;
        private LocalDate expiryDate;
        private String storageLocation;
        private Boolean screeningPassed;
        private BigDecimal costPrice;
        private BigDecimal salePrice;
        private Integer issuedToPatientId;
        private String issuedToPatientName;
        private UUID issuedToAdmissionId;
        private String issuedToAdmissionNumber;
        private UUID issuedByUserId;
        private String issuedByUserName;
        private LocalDateTime issuedAt;
        private String issuedDoctorName;
        private Integer replacementsPledged;
        private Integer replacementsReceived;
        private UUID invoiceItemId;
        private String notes;
        private LocalDateTime createdAt;
        /** True if the bag's expiry is within the dashboard's warn window. */
        private Boolean expiringSoon;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UnitRequest {
        private String bagNumber;
        private String bloodGroupCode;
        private String componentCode;
        private String sourceCode;
        private UUID donorId;
        private Integer volumeMl;
        private LocalDate collectionDate;
        /** Optional — if absent, expiry is computed from component shelf life. */
        private LocalDate expiryDate;
        private String storageLocation;
        private Boolean screeningPassed;
        private BigDecimal costPrice;
        private BigDecimal salePrice;
        private String notes;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class IssueUnitRequest {
        private Integer patientId;
        private UUID admissionId;
        private String doctorName;
        private Integer replacementsPledged;
        private BigDecimal salePrice;
        private String notes;
        /** Set true to proceed despite an ABO/Rh mismatch with the patient's recorded blood group. */
        private Boolean overrideIncompatibility;
        /** Required when overrideIncompatibility is true — recorded on the bag's notes for audit. */
        private String incompatibilityOverrideReason;
    }

    // ─────── Stats ─────────────────────────────────────────────────────

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatsDto {
        private long totalUnits;
        private long availableUnits;
        private long quarantineUnits;
        private long reservedUnits;
        private long issuedUnits;
        private long expiringSoonUnits;
        private long totalDonors;
        /** Map keyed by groupCode → componentCode → count of AVAILABLE units. */
        private Map<String, Map<String, Long>> stockMatrix;
        private List<UnitDto> expiringSoon;
    }
}
