package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(columnNames = { "email", "hospital_id" }))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hospital_id") // NULL for SUPER_ADMIN
    private Hospital hospital;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "role_id", nullable = false)
    private Role role;

    /**
     * Login identity, and treated as the employee's personal address — only the
     * user themselves and hospital admins ever see it back from the directory
     * endpoints. Colleagues get {@link #workEmail} instead.
     */
    @Column(nullable = false)
    private String email;

    /**
     * Official/work address, safe to show hospital-wide. Optional: staff hired
     * before this existed simply have none, and the directory shows no email
     * for them rather than falling back to the personal one.
     */
    @Column(name = "work_email")
    private String workEmail;

    // Nullable for Google SSO users
    private String passwordHash;

    // Google OAuth subject ID
    @Column(unique = true)
    private String googleId;

    @Column(nullable = false)
    private String firstName;

    private String lastName;
    private String phone;

    @Column(name = "employee_code", unique = true)
    private String employeeCode;

    private String designation;

    private String gender;

    @Column(name = "state", length = 100)
    private String state;

    @Column(name = "date_of_joining")
    private java.time.LocalDate dateOfJoining;

    @Column(name = "branch_id")
    private UUID branchId;

    @Column(name = "aadhaar_number", length = 12)
    private String aadhaarNumber;

    @Column(name = "pan_number", length = 10)
    private String panNumber;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "department_id")
    private Department department;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "designation_id")
    private Designation designationRef;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Builder.Default
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Builder.Default
    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    public void onCreate() {
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
        this.updatedAt = LocalDateTime.now();
        normalizeCase();
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
        normalizeCase();
    }

    private void normalizeCase() {
        if (email != null) {
            this.email = email.toLowerCase().trim();
        }
        if (workEmail != null) {
            this.workEmail = workEmail.isBlank() ? null : workEmail.toLowerCase().trim();
        }
    }
}
