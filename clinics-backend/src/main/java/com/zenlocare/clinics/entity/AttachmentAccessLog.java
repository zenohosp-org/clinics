package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Append-only "who-touched-this-attachment-when" trail. Mirrors the
 * RoomLog pattern: every read, download, or metadata access for a
 * record_attachment row writes one of these. Required for medical-data
 * regulatory posture (DPDP Act 2023 right-to-access, breach forensics).
 *
 * Rows are insert-only; there is no update or delete path in the
 * service layer. id is bigserial so even high-volume hospitals don't
 * exhaust the UUID pool.
 */
@Entity
@Table(name = "attachment_access_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttachmentAccessLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "attachment_id", nullable = false)
    private UUID attachmentId;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "accessed_by", nullable = false)
    private UUID accessedBy;

    /** UPLOAD | READ | DOWNLOAD — additive, do not remove or rename existing values. */
    @Column(name = "access_type", nullable = false, length = 16)
    private String accessType;

    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Builder.Default
    @Column(name = "accessed_at", nullable = false, updatable = false)
    private LocalDateTime accessedAt = LocalDateTime.now();
}
