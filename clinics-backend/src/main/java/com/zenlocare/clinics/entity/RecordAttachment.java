package com.zenlocare.clinics.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Metadata for a file (handwritten note PNG, lab/radiology report PDF,
 * etc.) attached to a patient and optionally to a specific
 * patient_records row. The actual bytes live in Supabase Storage under
 * {@code storage_key}; this row carries the indexable description.
 *
 * Append-only — there is no archived_at or soft-delete column. The
 * existing RoomLog pattern is the template: corrections happen by
 * uploading a new row whose caption flags the previous one as
 * superseded, never by mutating or removing the original.
 *
 * Tenant scope is enforced at the service layer via
 * {@code assertSameHospital} (mirroring AdmissionService), not via
 * row-level security on the DB. Every read + write checks that the
 * authenticated user's hospital_id matches the row's hospital_id.
 */
@Entity
@Table(name = "record_attachments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecordAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "hospital_id", nullable = false)
    private UUID hospitalId;

    @Column(name = "patient_id", nullable = false)
    private Integer patientId;

    /** Nullable — supports standalone attachments unaffiliated with a specific record. */
    @Column(name = "record_id")
    private UUID recordId;

    /** HANDWRITTEN_NOTE | LAB_REPORT | RADIOLOGY_REPORT | PATHOLOGY_REPORT | OTHER */
    @Column(nullable = false, length = 32)
    private String category;

    /** INTERNAL_DOCTOR | EXTERNAL_LAB | EXTERNAL_RADIOLOGY | EXTERNAL_OTHER */
    @Column(nullable = false, length = 32)
    private String source;

    /** Lab / clinic / hospital name when source is external. Null for INTERNAL_DOCTOR. */
    @Column(name = "source_name", length = 255)
    private String sourceName;

    /** Original client-supplied filename, kept verbatim for display. Never used as the storage key. */
    @Column(name = "file_name_original", nullable = false, length = 255)
    private String fileNameOriginal;

    /** Whitelisted at the controller: image/png|jpeg|webp, application/pdf. */
    @Column(name = "mime_type", nullable = false, length = 80)
    private String mimeType;

    @Column(name = "size_bytes", nullable = false)
    private Long sizeBytes;

    /** Hex SHA-256 of the bytes. Integrity check on download; future dedup hook. */
    @Column(nullable = false, length = 64)
    private String sha256;

    /** Path inside the Supabase Storage bucket. Convention: {hospitalId}/{patientId}/{id}.{ext} */
    @Column(name = "storage_key", nullable = false, length = 512)
    private String storageKey;

    /** Doctor's one-line description of what this attachment is. */
    @Column(length = 500)
    private String caption;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Builder.Default
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
