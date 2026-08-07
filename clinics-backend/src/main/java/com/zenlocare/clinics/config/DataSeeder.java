package com.zenlocare.clinics.config;

import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.Role;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.RoleRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Inherited from HMS, and <strong>disabled by default in Clinics</strong>.
 *
 * <p>This runner issues raw DDL against the database on every boot — it drops
 * NOT NULL constraints, renames columns ({@code hospital_services
 * .specialization_id → department_id}), drops and re-adds foreign keys, and
 * creates tables and indexes. That is safe in HMS, which owns its schema.
 *
 * <p>Clinics shares HMS's database. Running this here means two services
 * racing to reshape the same tables on startup, and a Clinics deploy could
 * apply a rename or constraint change that the running HMS does not expect —
 * against live patient data. {@code spring.jpa.hibernate.ddl-auto=none} does
 * not prevent any of it, because these statements bypass Hibernate entirely.
 *
 * <p>Disabling loses nothing: every statement is idempotent bootstrap work
 * that HMS has already performed on the shared database, and the reference
 * rows it seeds (roles, demo hospital) are already present for the same
 * reason. Clinics reads exactly the rows HMS seeded.
 *
 * <p>Set {@code clinics.data-seeder.enabled=true} only when pointing Clinics
 * at a fresh, unshared database that nothing else owns.
 */
@Slf4j
@Component
@ConditionalOnProperty(
        name = "clinics.data-seeder.enabled",
        havingValue = "true",
        matchIfMissing = false)
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final HospitalRepository hospitalRepository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        try {
            jdbcTemplate.execute("ALTER TABLE users ALTER COLUMN last_name DROP NOT NULL");
            log.info("✅ Made last_name nullable in users table");
        } catch (Exception e) {
            log.warn("Could not alter users.last_name: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute(
                "UPDATE doctors SET available_days_mask = " +
                "  (CASE WHEN available_days LIKE '%MON%' THEN 1  ELSE 0 END) +" +
                "  (CASE WHEN available_days LIKE '%TUE%' THEN 2  ELSE 0 END) +" +
                "  (CASE WHEN available_days LIKE '%WED%' THEN 4  ELSE 0 END) +" +
                "  (CASE WHEN available_days LIKE '%THU%' THEN 8  ELSE 0 END) +" +
                "  (CASE WHEN available_days LIKE '%FRI%' THEN 16 ELSE 0 END) +" +
                "  (CASE WHEN available_days LIKE '%SAT%' THEN 32 ELSE 0 END) +" +
                "  (CASE WHEN available_days LIKE '%SUN%' THEN 64 ELSE 0 END) " +
                "WHERE available_days IS NOT NULL AND available_days_mask IS NULL");
            log.info("✅ Migrated available_days → available_days_mask bitmask");
        } catch (Exception e) {
            log.warn("Could not migrate available_days to bitmask: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute(
                "UPDATE doctors SET specialization_id_1 = specialization_id " +
                "WHERE specialization_id_1 IS NULL AND specialization_id IS NOT NULL");
            log.info("✅ Migrated specialization_id → specialization_id_1");
        } catch (Exception e) {
            log.warn("Could not migrate specialization_id: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE patients ALTER COLUMN dob DROP NOT NULL");
            log.info("✅ Dropped NOT NULL on patients.dob");
        } catch (Exception e) {
            log.warn("Could not alter patients.dob: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS room_id bigint");
            log.info("✅ Added room_id to stores");
        } catch (Exception e) {
            log.warn("Could not add room_id to stores: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_room_type_check");
            log.info("✅ Dropped rooms_room_type_check constraint");
        } catch (Exception e) {
            log.warn("Could not drop rooms_room_type_check: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS admission_id UUID REFERENCES admissions(id)");
            log.info("✅ Added admission_id to appointments");
        } catch (Exception e) {
            log.warn("Could not add admission_id to appointments: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id)");
            jdbcTemplate.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITHOUT TIME ZONE");
            log.info("✅ Added cancelled_by and cancelled_at to appointments");
        } catch (Exception e) {
            log.warn("Could not add cancelled_by and cancelled_at to appointments: " + e.getMessage());
        }
        try {
            // Stamp pulled pharmacy bills onto invoice_items so the IPD finalize
            // modal can dedupe across reloads without comparing drug names.
            jdbcTemplate.execute(
                "ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS pharmacy_bill_id UUID");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_invoice_items_pharmacy_bill_id ON invoice_items(pharmacy_bill_id)");
            log.info("✅ Ensured invoice_items.pharmacy_bill_id");
        } catch (Exception e) {
            log.warn("Could not add pharmacy_bill_id to invoice_items: " + e.getMessage());
        }
        try {
            // One in-flight consultation per appointment. Cleared on save.
            // FK to users(created_by) is enforced by JPA on read/write; we
            // skip the explicit REFERENCES so the DDL doesn't need to know
            // the users PK column name across profiles.
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS consultation_drafts (
                    id              uuid PRIMARY KEY,
                    appointment_id  uuid NOT NULL UNIQUE,
                    hospital_id     uuid NOT NULL,
                    patient_id      integer NOT NULL,
                    created_by      uuid NOT NULL,
                    payload         text NOT NULL,
                    created_at      timestamp without time zone NOT NULL DEFAULT NOW(),
                    updated_at      timestamp without time zone NOT NULL DEFAULT NOW()
                )
                """);
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_consultation_drafts_hospital_id ON consultation_drafts(hospital_id)");
            log.info("✅ Ensured consultation_drafts table");
        } catch (Exception e) {
            log.warn("Could not ensure consultation_drafts: " + e.getMessage());
        }
        try {
            // Per-visit vitals captured by the nurse before the doctor
            // starts the consultation. One row per appointment (UNIQUE);
            // re-takes UPDATE the same row. Individually-typed columns
            // (no JSON blob) so each measure is trendable and alertable
            // downstream.
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS appointment_vitals (
                    id              uuid PRIMARY KEY,
                    appointment_id  uuid NOT NULL UNIQUE,
                    hospital_id     uuid NOT NULL,
                    patient_id      integer NOT NULL,
                    bp_systolic     integer NULL,
                    bp_diastolic    integer NULL,
                    spo2            integer NULL,
                    heart_rate      integer NULL,
                    weight_kg       numeric(5,2) NULL,
                    height_cm       integer NULL,
                    blood_glucose   integer NULL,
                    recorded_by     uuid NOT NULL,
                    recorded_at     timestamp without time zone NOT NULL DEFAULT NOW(),
                    updated_at      timestamp without time zone NOT NULL DEFAULT NOW()
                )
                """);
            try {
                jdbcTemplate.execute("ALTER TABLE appointment_vitals ADD COLUMN IF NOT EXISTS height_cm integer NULL");
                jdbcTemplate.execute("ALTER TABLE appointment_vitals ADD COLUMN IF NOT EXISTS blood_glucose integer NULL");
            } catch (Exception alterEx) {
                log.warn("Could not alter appointment_vitals to add height_cm/blood_glucose columns: " + alterEx.getMessage());
            }
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_appointment_vitals_hospital_id ON appointment_vitals(hospital_id)");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_appointment_vitals_patient_id ON appointment_vitals(patient_id, recorded_at DESC)");
            log.info("✅ Ensured appointment_vitals table");
        } catch (Exception e) {
            log.warn("Could not ensure appointment_vitals: " + e.getMessage());
        }
        try {
            // Ward's roomType used to live only on its rooms — empty wards or
            // edits before adding rooms lost the type. Persist it on the ward
            // itself and backfill from the first room for legacy rows.
            jdbcTemplate.execute("ALTER TABLE hospital_wards ADD COLUMN IF NOT EXISTS room_type VARCHAR(30)");
            jdbcTemplate.update("""
                UPDATE hospital_wards w
                   SET room_type = sub.room_type
                  FROM (
                      SELECT DISTINCT ON (ward_id) ward_id, room_type
                        FROM rooms
                       WHERE ward_id IS NOT NULL AND room_type IS NOT NULL
                       ORDER BY ward_id, room_id
                  ) sub
                 WHERE w.id = sub.ward_id
                   AND (w.room_type IS NULL OR w.room_type = '')
                """);
            log.info("✅ Ensured hospital_wards.room_type column and backfilled from rooms");
        } catch (Exception e) {
            log.warn("Could not ensure hospital_wards.room_type: " + e.getMessage());
        }

        try {
            jdbcTemplate.execute("ALTER TABLE hospital_services RENAME COLUMN specialization_id TO department_id");
            log.info("✅ Migrated hospital_services column specialization_id -> department_id");
        } catch (Exception e) {
            log.warn("Could not migrate hospital_services column: " + e.getMessage());
        }

        try {
            String dropFkSql = "DO $$ " +
                               "DECLARE " +
                               "    r RECORD; " +
                               "BEGIN " +
                               "    FOR r IN (SELECT tc.constraint_name " +
                               "              FROM information_schema.table_constraints tc " +
                               "              JOIN information_schema.key_column_usage kcu " +
                               "                ON tc.constraint_name = kcu.constraint_name " +
                               "              WHERE tc.constraint_type = 'FOREIGN KEY' " +
                               "                AND tc.table_name = 'hospital_services' " +
                               "                AND kcu.column_name = 'department_id') " +
                               "    LOOP " +
                               "        EXECUTE 'ALTER TABLE hospital_services DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name); " +
                               "    END LOOP; " +
                               "END $$;";
            jdbcTemplate.execute(dropFkSql);
            log.info("✅ Dropped old foreign key constraints from hospital_services.department_id");
            
            jdbcTemplate.execute("ALTER TABLE hospital_services ADD CONSTRAINT fk_hospital_services_department_id FOREIGN KEY (department_id) REFERENCES departments (id)");
            log.info("✅ Added new foreign key constraint fk_hospital_services_department_id");
        } catch (Exception e) {
            log.warn("Could not replace foreign key constraint on hospital_services: " + e.getMessage());
        }

        dropGhostStatusNotNullConstraints();
        seedReferenceTables();
        migrateStatusColumns();
        migrateDischargeData();
        backfillHospitalNumericCodes();
        backfillInvoiceVersions();
        backfillPatientRegistrationFlag();
        backfillAppointmentTokens();
        migrateRoomAttenderToAdmission();
        ensureRoomOccupancyColumns();
        ensureBedColumns();
        backfillBedsHospitalId();
        backfillStoreTypesFromRoomType();
        ensurePrescriptionSchema();
        ensureAttachmentSchema();
        seedRoomTypeConfigs();
        seedRoles();
        seedHospitalAdmin();
        ensureZemaRulesSchema();
        seedZemaRules();
        ensureBloodBankSchema();
        seedBloodBankLookups();
        ensureBiomedicalWasteSchema();
        seedBiomedicalWasteLookups();
        seedGstRates();
        seedLabsDepartmentPerHospital();
        seedRadiologyDepartmentPerHospital();
    }

    /**
     * Every hospital gets a system-default "Labs" department (code=LABS) so
     * the lab-order picker on IPD / Consultation can populate from
     * department-scoped HospitalServices without the operator having to
     * create the department manually first. Idempotent — runs are no-ops
     * once the department exists. Filter is by code (stable contract);
     * operators can rename the display name without breaking anything.
     */
    private void seedLabsDepartmentPerHospital() {
        try {
            for (Hospital hospital : hospitalRepository.findAll()) {
                Integer existing = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM public.departments WHERE hospital_id = ? AND code = 'LABS'",
                        Integer.class, hospital.getId());
                if (existing != null && existing > 0) continue;
                jdbcTemplate.update("""
                    INSERT INTO public.departments (id, hospital_id, name, type, code, description, is_active, created_at)
                    VALUES (gen_random_uuid(), ?, 'Labs', 'CLINICAL', 'LABS',
                            'Lab investigations catalogue — services here populate the pathology order picker.',
                            true, now())
                    """, hospital.getId());
            }
            log.info("✅ Ensured 'Labs' department (code=LABS) for every hospital");
        } catch (Exception e) {
            log.warn("Could not seed Labs department: {}", e.getMessage());
        }
    }

    /**
     * Sibling of the Labs seed. Services tagged to this department feed
     * the Radiology order picker on the IPD Investigations tab. The HMS
     * front-end routes orders by department code: LABS → /api/lab,
     * RADIOLOGY → /api/radiology.
     */
    private void seedRadiologyDepartmentPerHospital() {
        try {
            for (Hospital hospital : hospitalRepository.findAll()) {
                Integer existing = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM public.departments WHERE hospital_id = ? AND code = 'RADIOLOGY'",
                        Integer.class, hospital.getId());
                if (existing != null && existing > 0) continue;
                jdbcTemplate.update("""
                    INSERT INTO public.departments (id, hospital_id, name, type, code, description, is_active, created_at)
                    VALUES (gen_random_uuid(), ?, 'Radiology', 'CLINICAL', 'RADIOLOGY',
                            'Radiology investigations catalogue — services here populate the radiology order picker.',
                            true, now())
                    """, hospital.getId());
            }
            log.info("✅ Ensured 'Radiology' department (code=RADIOLOGY) for every hospital");
        } catch (Exception e) {
            log.warn("Could not seed Radiology department: {}", e.getMessage());
        }
    }

    /**
     * One-time migration: attender data lived on Room (attender_name / attender_phone /
     * attender_relationship). Refactor moved it to Admission so multi-bed wards each
     * get their own per-bed attender. Before dropping the Room columns:
     *   1. For every active (ADMITTED) admission still missing attender data on the
     *      admission but whose Room has it, copy the values across.
     *   2. Drop the now-unused Room attender_* columns.
     * Runs idempotently — DROP COLUMN IF EXISTS means subsequent boots are a no-op.
     */
    private void migrateRoomAttenderToAdmission() {
        try {
            int copied = jdbcTemplate.update("""
                UPDATE admissions adm
                   SET attender_name         = r.attender_name,
                       attender_phone        = r.attender_phone,
                       attender_relationship = r.attender_relationship
                  FROM rooms r
                 WHERE adm.room_id = r.room_id
                   AND adm.status_id = 1                       -- ADMITTED
                   AND (adm.attender_name IS NULL OR adm.attender_name = '')
                   AND r.attender_name IS NOT NULL
                """);
            if (copied > 0) log.info("✅ Copied attender_* from Room → Admission on {} active rows", copied);
        } catch (Exception e) {
            log.warn("Could not copy room.attender_* into admission: " + e.getMessage());
        }
        try {
            jdbcTemplate.execute("ALTER TABLE rooms DROP COLUMN IF EXISTS attender_name");
            jdbcTemplate.execute("ALTER TABLE rooms DROP COLUMN IF EXISTS attender_phone");
            jdbcTemplate.execute("ALTER TABLE rooms DROP COLUMN IF EXISTS attender_relationship");
        } catch (Exception e) {
            log.warn("Could not drop rooms.attender_* columns: " + e.getMessage());
        }
    }

    /**
     * Re-asserts every optional Room column. The Room entity has gained
     * several columns over time (admission_date, approx_discharge_time,
     * allocation_token, ward / ward_id, bed_count, version, is_active);
     * some environments have one or more dropped externally, which breaks
     * every SELECT against rooms (Hibernate lists every @Column in the
     * SELECT clause). All ADDs are IF NOT EXISTS so this is idempotent
     * and a no-op once the schema is in sync.
     */
    private void ensureRoomOccupancyColumns() {
        String[] alters = {
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS admission_date TIMESTAMP",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS approx_discharge_time TIMESTAMP",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS allocation_token VARCHAR(30)",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ward VARCHAR(100)",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS ward_id BIGINT",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bed_count INTEGER",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 0",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_code VARCHAR(20)",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS department_id UUID",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS patient_id INTEGER",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status_id INTEGER",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price_per_day NUMERIC(10,2)",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        };
        for (String sql : alters) {
            try {
                jdbcTemplate.execute(sql);
            } catch (Exception e) {
                log.warn("Skipped: {} — {}", sql, e.getMessage());
            }
        }
    }

    /**
     * One-time fix for the pre-InfrastructureService rewrite: every store row
     * HMS wrote carried type="STORE" regardless of the originating room's
     * roomType, so Pharmacy/Blood Bank couldn't find their canonical stores
     * by type. Re-anchors the stores.type column to the room's actual roomType
     * for the four HMS-governed types (STORE, PHARMACY, PHARMACY_INV,
     * BLOOD_BANK). Inventory-module rows are left untouched — the join
     * filter on r.room_type excludes anything pointing at a room type HMS
     * doesn't author. Idempotent: re-running is a no-op once aligned.
     */
    /**
     * Repairs beds rows whose hospital_id is NULL — legacy from the bed-
     * tracking refactor that added the column before InfrastructureService
     * was setting it on save. Hospital is resolved from the bed's parent
     * (room first, ward second). Both joins are filtered so we never write
     * a NULL where we couldn't determine the hospital — those rows stay
     * untouched and surface via the entity's NOT NULL constraint, which
     * is the right behaviour for genuinely orphan beds.
     *
     * Idempotent: re-running is a no-op once all reachable rows have
     * hospital_id populated.
     */
    private void backfillBedsHospitalId() {
        try {
            int viaRoom = jdbcTemplate.update("""
                UPDATE beds b
                SET    hospital_id = r.hospital_id
                FROM   rooms r
                WHERE  b.room_id = r.room_id
                  AND  b.hospital_id IS NULL
                  AND  r.hospital_id IS NOT NULL
                """);
            int viaWard = jdbcTemplate.update("""
                UPDATE beds b
                SET    hospital_id = w.hospital_id
                FROM   hospital_wards w
                WHERE  b.ward_id = w.id
                  AND  b.hospital_id IS NULL
                  AND  w.hospital_id IS NOT NULL
                """);
            int total = viaRoom + viaWard;
            if (total > 0) {
                log.info("✅ Backfilled beds.hospital_id for {} row(s) ({} via room, {} via ward)",
                        total, viaRoom, viaWard);
            }
        } catch (Exception e) {
            log.warn("Could not backfill beds.hospital_id: {}", e.getMessage());
        }
    }

    private void backfillStoreTypesFromRoomType() {
        try {
            int updated = jdbcTemplate.update("""
                UPDATE stores s
                SET    type = r.room_type
                FROM   rooms r
                WHERE  s.room_id = r.room_id
                  AND  r.room_type IN ('STORE','PHARMACY','PHARMACY_INV','BLOOD_BANK')
                  AND  s.type IS DISTINCT FROM r.room_type
                """);
            if (updated > 0) {
                log.info("✅ Backfilled stores.type from rooms.room_type for {} row(s)", updated);
            }
        } catch (Exception e) {
            log.warn("Could not backfill stores.type from rooms.room_type: {}", e.getMessage());
        }
    }

    /**
     * Same idempotent column-assertion for the beds table. Bed entity gained
     * patient_id, status_id, ward_id, is_active over time and drifted
     * environments are missing one or more. Each ALTER is IF NOT EXISTS and
     * try-guarded so one bad statement doesn't tank the rest.
     */
    private void ensureBedColumns() {
        String[] alters = {
            "ALTER TABLE beds ADD COLUMN IF NOT EXISTS room_id BIGINT",
            "ALTER TABLE beds ADD COLUMN IF NOT EXISTS ward_id BIGINT",
            "ALTER TABLE beds ADD COLUMN IF NOT EXISTS patient_id INTEGER",
            "ALTER TABLE beds ADD COLUMN IF NOT EXISTS status_id INTEGER",
            "ALTER TABLE beds ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true",
            "ALTER TABLE beds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        };
        for (String sql : alters) {
            try {
                jdbcTemplate.execute(sql);
            } catch (Exception e) {
                log.warn("Skipped: {} — {}", sql, e.getMessage());
            }
        }
    }

    /**
     * Prescription support — adds the appointment_id audit column to
     * patient_records (OPD prescriptions link back to the appointment they
     * were written for) and creates the structured prescription_items child
     * table. Hibernate's ddl-auto=update would handle most of this for new
     * deployments, but explicit SQL means a fresh boot doesn't depend on
     * entity scan order, and the FK + indexes get the names we want.
     *
     * Idempotent via IF NOT EXISTS — safe to re-run on every boot.
     */
    private void ensurePrescriptionSchema() {
        try {
            jdbcTemplate.execute(
                "ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS appointment_id uuid");
            // OPD consultation form stores discharge / follow-up instructions
            // separately from the doctor's narrative description so prints can
            // split them without parsing prose.
            jdbcTemplate.execute(
                "ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS instructions text");

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS prescription_items (
                    id              uuid PRIMARY KEY,
                    history_id      uuid NOT NULL REFERENCES patient_records(history_id) ON DELETE CASCADE,
                    drug_id         uuid NULL,
                    drug_name       varchar(255) NOT NULL,
                    drug_generic    varchar(255) NULL,
                    drug_strength   varchar(100) NULL,
                    drug_form       varchar(50)  NULL,
                    dose            varchar(100) NULL,
                    frequency_id    integer      NULL,
                    duration_days   integer      NULL,
                    quantity        integer      NOT NULL,
                    route_id        integer      NULL,
                    instructions    text         NULL,
                    display_order   integer      NULL DEFAULT 0,
                    created_at      timestamp without time zone NOT NULL DEFAULT NOW()
                )
                """);

            // If an earlier build of this table used varchar columns for frequency/route,
            // migrate to the integer-FK shape that matches the rest of the codebase.
            // Both ADD and DROP are guarded so this runs idempotently on every boot.
            jdbcTemplate.execute(
                "ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS frequency_id integer");
            jdbcTemplate.execute(
                "ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS route_id integer");
            jdbcTemplate.execute("ALTER TABLE prescription_items DROP COLUMN IF EXISTS frequency");
            jdbcTemplate.execute("ALTER TABLE prescription_items DROP COLUMN IF EXISTS route");

            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_prescription_items_history_id ON prescription_items(history_id)");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_prescription_items_drug_id ON prescription_items(drug_id)");

            // Pharmacy dispense tracking: dispensedQty walks up per dispense
            // callback, dispenseStatus follows. Defaults make legacy rows
            // backfill to PENDING / 0 without a one-off UPDATE.
            jdbcTemplate.execute(
                "ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS dispensed_qty integer NOT NULL DEFAULT 0");
            jdbcTemplate.execute(
                "ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS dispense_status varchar(16) NOT NULL DEFAULT 'PENDING'");
        } catch (Exception e) {
            log.warn("Could not ensure prescription schema: " + e.getMessage());
        }
    }

    /**
     * Attachment + external test result schema. Three append-only tables:
     *   record_attachments      — metadata for files stored in Supabase Storage.
     *                              The actual bytes live at storage_key in the
     *                              hms-attachments bucket; we keep file_name,
     *                              mime_type, size_bytes, sha256, and the link
     *                              back to the patient + (optionally) the
     *                              consultation record here.
     *   attachment_access_log   — append-only "who viewed/downloaded what when"
     *                              audit trail. Same shape as RoomLog.
     *   external_test_results   — structured lab/radiology data the doctor
     *                              captured from an outside lab/clinic. Can
     *                              carry a scanned report via attachment_id.
     *
     * No archived_at / soft-delete columns anywhere — hospitals don't delete
     * medical evidence. Corrections happen via a new row with a caption,
     * matching the existing append-only RoomLog pattern.
     */
    private void ensureAttachmentSchema() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS record_attachments (
                    id                   uuid PRIMARY KEY,
                    hospital_id          uuid NOT NULL,
                    patient_id           integer NOT NULL,
                    record_id            uuid NULL REFERENCES patient_records(history_id),
                    category             varchar(32) NOT NULL,
                    source               varchar(32) NOT NULL,
                    source_name          varchar(255),
                    file_name_original   varchar(255) NOT NULL,
                    mime_type            varchar(80)  NOT NULL,
                    size_bytes           bigint NOT NULL,
                    sha256               varchar(64) NOT NULL,
                    storage_key          varchar(512) NOT NULL,
                    caption              varchar(500),
                    created_by           uuid NOT NULL,
                    created_at           timestamp without time zone NOT NULL DEFAULT NOW()
                )
                """);
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_record_attachments_record   ON record_attachments(record_id)");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_record_attachments_patient  ON record_attachments(patient_id, created_at DESC)");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_record_attachments_hospital ON record_attachments(hospital_id, created_at DESC)");

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS attachment_access_log (
                    id              bigserial PRIMARY KEY,
                    attachment_id   uuid NOT NULL,
                    hospital_id     uuid NOT NULL,
                    accessed_by     uuid NOT NULL,
                    access_type     varchar(16) NOT NULL,
                    user_agent      varchar(255),
                    ip_address      varchar(45),
                    accessed_at     timestamp without time zone NOT NULL DEFAULT NOW()
                )
                """);
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_attachment_access_log_attachment ON attachment_access_log(attachment_id, accessed_at DESC)");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_attachment_access_log_user       ON attachment_access_log(accessed_by, accessed_at DESC)");

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS external_test_results (
                    id                   uuid PRIMARY KEY,
                    hospital_id          uuid NOT NULL,
                    patient_id           integer NOT NULL,
                    record_id            uuid NULL REFERENCES patient_records(history_id),
                    category             varchar(24) NOT NULL,
                    test_name            varchar(255) NOT NULL,
                    test_code            varchar(40),
                    result_value         varchar(255),
                    result_unit          varchar(40),
                    reference_range      varchar(80),
                    is_abnormal          boolean,
                    test_date            date NOT NULL,
                    source_name          varchar(255) NOT NULL,
                    source_doctor_name   varchar(255),
                    attachment_id        uuid NULL REFERENCES record_attachments(id),
                    notes                text,
                    created_by           uuid NOT NULL,
                    created_at           timestamp without time zone NOT NULL DEFAULT NOW()
                )
                """);
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_external_results_patient  ON external_test_results(patient_id, test_date DESC)");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_external_results_record   ON external_test_results(record_id)");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_external_results_hospital ON external_test_results(hospital_id, test_date DESC)");

            // Migration: link results to the visit (appointment) they
            // were captured during. Triage staff enter reports at
            // CHECKED_IN — well before a consultation record exists —
            // so binding to appointment_id (not record_id) is the only
            // way to keep this-visit results out of stale-result noise.
            jdbcTemplate.execute(
                "ALTER TABLE external_test_results ADD COLUMN IF NOT EXISTS appointment_id uuid");
            jdbcTemplate.execute(
                "CREATE INDEX IF NOT EXISTS idx_external_results_appointment ON external_test_results(appointment_id)");

            log.info("✅ Ensured attachment + external-result schema");
        } catch (Exception e) {
            log.warn("Could not ensure attachment schema: " + e.getMessage());
        }
    }

    /**
     * Tokens used to be assigned only when (apptDate == today). Future-dated
     * appointments that staff moved straight to CONFIRMED/COMPLETED ended up
     * with token_number = NULL. Walk those rows and assign sequential tokens
     * per (hospital_id, appt_date) in createdAt order, continuing from the
     * day's existing MAX. Status IDs: 2=CONFIRMED 3=CHECKED_IN 4=IN_PROGRESS
     * 5=COMPLETED 8=BILLED.
     */
    private void backfillAppointmentTokens() {
        try {
            int rows = jdbcTemplate.update("""
                WITH eligible AS (
                  SELECT a.id,
                         (SELECT COALESCE(MAX(a2.token_number), 0)
                            FROM appointments a2
                           WHERE a2.hospital_id = a.hospital_id
                             AND a2.appt_date   = a.appt_date) AS day_max,
                         ROW_NUMBER() OVER (
                           PARTITION BY a.hospital_id, a.appt_date
                           ORDER BY a.created_at
                         ) AS rn
                    FROM appointments a
                   WHERE a.token_number IS NULL
                     AND a.status_id IN (2, 3, 4, 5, 8)
                )
                UPDATE appointments
                   SET token_number = e.day_max + e.rn
                  FROM eligible e
                 WHERE appointments.id = e.id
                   AND (e.day_max + e.rn) <= 100
                """);
            if (rows > 0) log.info("✅ Backfilled token_number on {} legacy appointment rows", rows);
        } catch (Exception e) {
            log.warn("Could not backfill appointment tokens: " + e.getMessage());
        }
    }

    /**
     * registration_fee_paid was added to support a once-per-patient registration
     * charge. For existing patients we need to:
     *   1. Make sure the column exists (Hibernate ddl-auto adds it, but be defensive).
     *   2. Backfill NULLs to FALSE so the column has a definite value everywhere.
     *   3. Flip to TRUE for any patient who already has a REGISTRATION line
     *      anywhere in their invoice history — they've already paid, must not
     *      be re-charged when they next visit.
     */
    private void backfillPatientRegistrationFlag() {
        try {
            jdbcTemplate.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS registration_fee_paid boolean");
            int nullFixed = jdbcTemplate.update(
                    "UPDATE patients SET registration_fee_paid = FALSE WHERE registration_fee_paid IS NULL");
            if (nullFixed > 0) log.info("✅ Defaulted registration_fee_paid=FALSE on {} legacy patient rows", nullFixed);

            int marked = jdbcTemplate.update("""
                UPDATE patients
                   SET registration_fee_paid = TRUE
                 WHERE registration_fee_paid = FALSE
                   AND patient_id IN (
                       SELECT DISTINCT inv.patient_id
                         FROM invoices inv
                         JOIN invoice_items ii ON ii.invoice_id = inv.id
                        WHERE ii.item_type = 'REGISTRATION'
                   )
                """);
            if (marked > 0) log.info("✅ Marked {} patients as already-registered based on past REGISTRATION items", marked);
        } catch (Exception e) {
            log.warn("Could not backfill patients.registration_fee_paid: " + e.getMessage());
        }
    }

    private void seedReferenceTables() {
        seedRefTable("appointment_statuses", new Object[][]{
            {1, "SCHEDULED"}, {2, "CONFIRMED"}, {3, "CHECKED_IN"}, {4, "IN_PROGRESS"},
            {5, "COMPLETED"}, {6, "CANCELLED"}, {7, "NO_SHOW"}, {8, "BILLED"}
        });
        seedRefTable("appointment_types", new Object[][]{
            {1, "OPD"}, {2, "FOLLOWUP"}, {3, "EMERGENCY"}, {4, "TELECONSULT"}, {5, "HEALTH_CHECKUP"}
        });
        seedRefTable("invoice_statuses", new Object[][]{
            {1, "UNPAID"}, {2, "PARTIAL"}, {3, "PAID"}, {4, "CANCELLED"}, {5, "SETTLED"}, {6, "UNSETTLED"}
        });
        seedRefTable("room_statuses", new Object[][]{
            {1, "AVAILABLE"}, {2, "OCCUPIED"}, {3, "MAINTENANCE"}
        });
        seedRefTable("bed_statuses", new Object[][]{
            {1, "AVAILABLE"}, {2, "OCCUPIED"}
        });
        seedRefTable("radiology_statuses", new Object[][]{
            {1, "PENDING_SCAN"}, {2, "AWAITING_REPORT"}, {3, "REPORT_GENERATED"}, {4, "BILLED"}
        });
        seedRefTable("radiology_priorities", new Object[][]{
            {1, "ROUTINE"}, {2, "URGENT"}, {3, "STAT"}
        });
        seedRefTable("ambulance_booking_statuses", new Object[][]{
            {1, "PENDING"}, {2, "DISPATCHED"}, {3, "EN_ROUTE"}, {4, "COMPLETED"}, {5, "CANCELLED"}
        });
        seedRefTable("ambulance_vehicle_statuses", new Object[][]{
            {1, "AVAILABLE"}, {2, "IN_USE"}, {3, "MAINTENANCE"}
        });
        seedRefTable("checkup_booking_statuses", new Object[][]{
            {1, "SCHEDULED"}, {2, "CHECKED_IN"}, {3, "IN_PROGRESS"},
            {4, "COMPLETED"}, {5, "CANCELLED"}, {6, "NO_SHOW"}
        });
        seedRefTable("admission_statuses", new Object[][]{
            {1, "ADMITTED"}, {2, "DISCHARGED"}, {3, "TRANSFERRED"}, {4, "ABSCONDED"}
        });
        seedRefTable("admission_types", new Object[][]{
            {1, "OPD_REFERRAL"}, {2, "EMERGENCY"}, {3, "DIRECT"}
        });
        seedRefTable("admission_sources", new Object[][]{
            {1, "OPD_REFERRAL"}, {2, "EMERGENCY_WALK_IN"}, {3, "DIRECT"}, {4, "TRANSFER_IN"}
        });
        seedRefTable("record_history_types", new Object[][]{
            {1, "CONSULTATION"}, {2, "PRESCRIPTION"}, {3, "LAB_RESULT"},
            {4, "SURGERY"}, {5, "DIAGNOSIS"}, {6, "OTHERS"}, {7, "PROGRESS_NOTE"}
        });
        // Clinical taxonomies for the prescription picker. Ids are stable
        // contract — adding new rows is OK, renumbering is not.
        seedRefTable("prescription_frequencies", new Object[][]{
            {1, "OD"}, {2, "BD"}, {3, "TDS"}, {4, "QID"},
            {5, "Q4H"}, {6, "Q6H"}, {7, "Q8H"},
            {8, "HS"}, {9, "AC"}, {10, "PC"},
            {11, "SOS"}, {12, "STAT"}
        });
        seedRefTable("prescription_routes", new Object[][]{
            {1, "ORAL"}, {2, "IV"}, {3, "IM"}, {4, "SC"},
            {5, "TOPICAL"}, {6, "INHALED"},
            {7, "OPHTHALMIC"}, {8, "OTIC"}, {9, "NASAL"}, {10, "RECTAL"}
        });
        log.info("✅ Reference tables seeded (16 tables).");
    }

    private void seedRefTable(String tableName, Object[][] rows) {
        try {
            jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS " + tableName + " (id INTEGER PRIMARY KEY, code VARCHAR(50) NOT NULL)"
            );
            for (Object[] row : rows) {
                jdbcTemplate.update(
                    "INSERT INTO " + tableName + " (id, code) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                    row[0], row[1]
                );
            }
        } catch (Exception e) {
            log.warn("Could not seed " + tableName + ": " + e.getMessage());
        }
    }

    private void dropGhostStatusNotNullConstraints() {
        String[][] cols = {
            {"invoices",               "status"},
            {"appointments",           "status"},
            {"appointments",           "type"},
            {"rooms",                  "status"},
            {"beds",                   "status"},
            {"radiology_orders",       "status"},
            {"radiology_orders",       "priority"},
            {"ambulance_bookings",     "status"},
            {"ambulance_vehicles",     "status"},
            {"health_checkup_bookings","status"},
            {"admissions",             "status"},
            {"admissions",             "admission_type"},
            {"admissions",             "admission_source"},
            {"patient_records",        "history_type"},
        };
        for (String[] col : cols) {
            try {
                jdbcTemplate.execute("ALTER TABLE " + col[0] + " ALTER COLUMN " + col[1] + " DROP NOT NULL");
                log.info("✅ Dropped NOT NULL on " + col[0] + "." + col[1]);
            } catch (Exception e) {
                log.warn("Could not drop NOT NULL on " + col[0] + "." + col[1] + ": " + e.getMessage());
            }
        }
    }

    private void migrateStatusColumns() {
        migrateColumn("appointments", "status_id", "status",
            new Object[][]{{1,"SCHEDULED"},{2,"CONFIRMED"},{3,"CHECKED_IN"},{4,"IN_PROGRESS"},
                           {5,"COMPLETED"},{6,"CANCELLED"},{7,"NO_SHOW"},{8,"BILLED"}});
        migrateColumn("appointments", "type_id", "type",
            new Object[][]{{1,"OPD"},{2,"FOLLOWUP"},{3,"EMERGENCY"},{4,"TELECONSULT"},{5,"HEALTH_CHECKUP"}});
        migrateColumn("invoices", "status_id", "status",
            new Object[][]{{1,"UNPAID"},{2,"PARTIAL"},{3,"PAID"},{4,"CANCELLED"},{5,"SETTLED"},{6,"UNSETTLED"}});
        migrateColumn("rooms", "status_id", "status",
            new Object[][]{{1,"AVAILABLE"},{2,"OCCUPIED"},{3,"MAINTENANCE"}});
        migrateColumn("beds", "status_id", "status",
            new Object[][]{{1,"AVAILABLE"},{2,"OCCUPIED"}});
        migrateColumn("radiology_orders", "status_id", "status",
            new Object[][]{{1,"PENDING_SCAN"},{2,"AWAITING_REPORT"},{3,"REPORT_GENERATED"},{4,"BILLED"}});
        migrateColumn("radiology_orders", "priority_id", "priority",
            new Object[][]{{1,"ROUTINE"},{2,"URGENT"},{3,"STAT"}});
        migrateColumn("ambulance_bookings", "status_id", "status",
            new Object[][]{{1,"PENDING"},{2,"DISPATCHED"},{3,"EN_ROUTE"},{4,"COMPLETED"},{5,"CANCELLED"}});
        migrateColumn("ambulance_vehicles", "status_id", "status",
            new Object[][]{{1,"AVAILABLE"},{2,"IN_USE"},{3,"MAINTENANCE"}});
        migrateColumn("health_checkup_bookings", "status_id", "status",
            new Object[][]{{1,"SCHEDULED"},{2,"CHECKED_IN"},{3,"IN_PROGRESS"},
                           {4,"COMPLETED"},{5,"CANCELLED"},{6,"NO_SHOW"}});
        migrateColumn("admissions", "status_id", "status",
            new Object[][]{{1,"ADMITTED"},{2,"DISCHARGED"},{3,"TRANSFERRED"},{4,"ABSCONDED"}});
        migrateColumn("admissions", "admission_type_id", "admission_type",
            new Object[][]{{1,"OPD_REFERRAL"},{2,"EMERGENCY"},{3,"DIRECT"}});
        migrateColumn("admissions", "admission_source_id", "admission_source",
            new Object[][]{{1,"OPD_REFERRAL"},{2,"EMERGENCY_WALK_IN"},{3,"DIRECT"},{4,"TRANSFER_IN"}});
        migrateColumn("patient_records", "history_type_id", "history_type",
            new Object[][]{{1,"CONSULTATION"},{2,"PRESCRIPTION"},{3,"LAB_RESULT"},
                           {4,"SURGERY"},{5,"DIAGNOSIS"},{6,"OTHERS"}});
        log.info("✅ Status columns migrated to integer IDs.");
    }

    private void migrateColumn(String table, String newCol, String oldCol, Object[][] mapping) {
        try {
            StringBuilder sql = new StringBuilder(
                "UPDATE " + table + " SET " + newCol + " = CASE " + oldCol
            );
            for (Object[] entry : mapping) {
                sql.append(" WHEN '").append(entry[1]).append("' THEN ").append(entry[0]);
            }
            sql.append(" ELSE NULL END WHERE ").append(newCol).append(" IS NULL AND ")
               .append(oldCol).append(" IS NOT NULL");
            jdbcTemplate.execute(sql.toString());
        } catch (Exception e) {
            log.warn("Could not migrate " + table + "." + oldCol + " → " + newCol + ": " + e.getMessage());
        }
    }

    private void seedRoomTypeConfigs() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS room_type_configs (
                    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id   UUID REFERENCES hospitals(id),
                    code          VARCHAR(30)  NOT NULL,
                    label         VARCHAR(100) NOT NULL,
                    category      VARCHAR(20)  DEFAULT 'WARD',
                    icon          VARCHAR(50),
                    color         VARCHAR(20),
                    is_system     BOOLEAN      DEFAULT false,
                    is_active     BOOLEAN      DEFAULT true,
                    display_order INTEGER      DEFAULT 0,
                    created_at    TIMESTAMP    DEFAULT now(),
                    UNIQUE(hospital_id, code)
                )
            """);
        } catch (Exception e) {
            log.warn("room_type_configs table may already exist: " + e.getMessage());
        }

        // bookable_ot: which OT-category types are real theatres/procedure rooms
        // the OT app can schedule surgeries in (vs pre-op / scrub / recovery).
        // Column added here; backfilled AFTER the system-defaults loop below so
        // freshly-seeded rows get a value too.
        try {
            jdbcTemplate.execute("ALTER TABLE room_type_configs ADD COLUMN IF NOT EXISTS bookable_ot BOOLEAN");
        } catch (Exception e) {
            log.warn("Could not add bookable_ot column: " + e.getMessage());
        }

        String[][] defaults = {
            {"GENERAL",      "General Ward",        "WARD",  "bed-double",  "#3b82f6",  "0", "true", "true"},
            {"WARD",         "Shared Ward",         "WARD",  "bed-double",  "#6366f1",  "1", "true", "true"},
            {"SEMI_PRIVATE", "Semi-Private Room",   "WARD",  "bed-single",  "#8b5cf6",  "2", "true", "true"},
            {"PRIVATE",      "Private Room",        "WARD",  "bed-single",  "#a855f7",  "3", "true", "true"},
            {"DELUXE",       "Deluxe / VIP Room",   "WARD",  "crown",       "#f59e0b",  "4", "true", "true"},
            {"ICU",          "ICU",                 "WARD",  "heart-pulse", "#ef4444",  "5", "true", "true"},
            {"NICU",         "Neonatal ICU",        "WARD",  "baby",        "#f87171",  "6", "true", "true"},
            {"ISOLATION",    "Isolation Room",      "WARD",  "shield",      "#f97316",  "7", "true", "true"},
            {"EMERGENCY",    "Emergency / ER",      "WARD",  "siren",       "#dc2626",  "8", "true", "true"},
            {"LABOUR",       "Labour & Delivery",   "WARD",  "heart",       "#ec4899",  "9", "true", "true"},
            {"OT",           "Operating Theatre",   "OT",    "scissors",    "#10b981", "10", "false", "false"},
            {"POST_OT",      "Post-Op Recovery",    "OT",    "activity",    "#14b8a6", "11", "true", "false"},
            {"CATH_LAB",     "Cath Lab",            "OT",       "heart-pulse", "#06b6d4", "12", "false", "false"},
            {"STORE",        "Inventory Store",     "STORE",    "package",     "#f59e0b", "13", "false", "false"},
            {"PHARMACY",     "Pharmacy Shop",       "PHARMACY", "store",       "#10b981", "14", "false", "false"},
            {"PHARMACY_INV", "Pharmacy Inventory",  "STORE",    "package",     "#8b5cf6", "15", "false", "false"},
        };

        // Explicit check-then-insert/update. The previous ON CONFLICT
        // (hospital_id, code) clause didn't fire for system rows because
        // Postgres treats NULL ≠ NULL in unique constraints, so every boot
        // appended a fresh copy and the table grew unbounded. A NULL-safe
        // SELECT works regardless. RoomTypeConfigDedupeRunner already
        // installed a partial unique index for (code) WHERE hospital_id
        // IS NULL by the time we get here, so a concurrent double-boot
        // would fail the second INSERT cleanly instead of duplicating.
        for (String[] d : defaults) {
            try {
                Integer existing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM room_type_configs " +
                    "WHERE hospital_id IS NULL AND code = ?",
                    Integer.class, d[0]);

                boolean hasBeds = Boolean.parseBoolean(d[6]);
                boolean hasDailyCharge = Boolean.parseBoolean(d[7]);

                if (existing != null && existing > 0) {
                    // Keep system rows fresh — label / category / icon /
                    // color / display_order may have been edited in the
                    // seed defaults since the last boot.
                    jdbcTemplate.update(
                        "UPDATE room_type_configs " +
                        "   SET label = ?, category = ?, icon = ?, color = ?, " +
                        "       is_system = true, display_order = ?, " +
                        "       has_beds = ?, has_daily_charge = ? " +
                        " WHERE hospital_id IS NULL AND code = ?",
                        d[1], d[2], d[3], d[4], Integer.parseInt(d[5]), hasBeds, hasDailyCharge, d[0]);
                } else {
                    jdbcTemplate.update(
                        "INSERT INTO room_type_configs " +
                        "  (hospital_id, code, label, category, icon, color, " +
                        "   is_system, is_active, display_order, has_beds, has_daily_charge) " +
                        "VALUES (NULL, ?, ?, ?, ?, ?, true, true, ?, ?, ?)",
                        d[0], d[1], d[2], d[3], d[4], Integer.parseInt(d[5]), hasBeds, hasDailyCharge);
                }
            } catch (Exception e) {
                log.warn("Could not seed room type " + d[0] + ": " + e.getMessage());
            }
        }

        // Backfill bookable_ot for any row that doesn't have it yet (freshly
        // seeded system rows + pre-existing custom rows). Preserves current
        // behaviour: OT-category minus POST_OT was bookable. NULL-guarded so an
        // explicit hospital choice is never clobbered on a later boot.
        try {
            jdbcTemplate.update(
                "UPDATE room_type_configs " +
                "   SET bookable_ot = (category = 'OT' AND code <> 'POST_OT') " +
                " WHERE bookable_ot IS NULL");
        } catch (Exception e) {
            log.warn("Could not backfill bookable_ot: " + e.getMessage());
        }

        log.info("✅ Room type configs seeded (14 system defaults).");
    }

    private void seedRoles() {
        createRoleIfAbsent("super_admin",    "Super Admin",    "Full system access",                    true, true, true,  true,  true, true);
        createRoleIfAbsent("hospital_admin", "Hospital Admin", "Administrative access for hospital",    true, true, true,  true,  true, true);
        createRoleIfAbsent("doctor",         "Doctor",         "Medical professional access",           true, true, false, false, true, false);
        createRoleIfAbsent("staff",          "Staff",          "General staff access",                  true, true, false, true,  false, true);
        createRoleIfAbsent("technician",     "Technician",     "Technical staff access",                true, true, false, false, true, true);
        log.info("✅ Roles seeded.");
    }

    private void createRoleIfAbsent(String name, String displayName, String description, boolean isSystem,
            boolean hms, boolean asset, boolean inventory, boolean ot, boolean pharmacy) {
        Role role = roleRepository.findByName(name).orElseGet(() -> Role.builder().name(name).build());
        role.setDisplayName(displayName);
        role.setDescription(description);
        role.setIsSystemRole(isSystem);
        role.setCanAccessHms(hms);
        role.setCanAccessAsset(asset);
        role.setCanAccessInventory(inventory);
        role.setCanAccessOt(ot);
        role.setCanAccessPharmacy(pharmacy);
        roleRepository.save(role);
    }

    private void seedHospitalAdmin() {
        Hospital hospital = hospitalRepository.findByCode("srm")
                .orElseGet(() -> hospitalRepository.save(
                        Hospital.builder()
                                .code("srm")
                                .name("SRM Hospital")
                                .subdomain("srm")
                                .address("Chennai, Tamil Nadu")
                                .build()));

        Role adminRole = roleRepository.findByName("hospital_admin")
                .orElseThrow(() -> new IllegalStateException("hospital_admin role not found after seed"));

        boolean exists = userRepository.existsByEmailAndHospital("admin@gmail.com", hospital);
        if (exists) {
            log.info("ℹ️  Hospital admin already exists — skipping.");
            return;
        }

        userRepository.save(
                User.builder()
                        .hospital(hospital)
                        .role(adminRole)
                        .email("admin@gmail.com")
                        .passwordHash(passwordEncoder.encode("admin123"))
                        .firstName("Zeno")
                        .lastName("Admin")
                        .isActive(true)
                        .build());

        log.info("✅ Hospital admin seeded → admin@gmail.com / admin123  [Hospital: SRM Hospital]");
    }

    private void backfillHospitalNumericCodes() {
        try {
            // Ensure the shared sequence exists and is synced to the current max — directory-backend
            // creates it too, but HMS-backend may start first on a fresh deploy. Idempotent.
            jdbcTemplate.execute(
                "CREATE SEQUENCE IF NOT EXISTS hospital_numeric_code_seq MINVALUE 1001 MAXVALUE 9999 START WITH 1001");
            jdbcTemplate.execute(
                "SELECT setval('hospital_numeric_code_seq', GREATEST(1000, "
                + "(SELECT COALESCE(MAX(CAST(numeric_code AS INTEGER)), 1000) FROM hospitals WHERE numeric_code ~ '^[0-9]{4}$')))");

            // Backfill any hospital rows that arrived with NULL numeric_code (legacy data or
            // hospitals created before directory-backend gained the auto-assign hook).
            // Order by created_at so older hospitals get the lower codes deterministically.
            java.util.List<java.util.Map<String, Object>> nullCoded = jdbcTemplate.queryForList(
                "SELECT id FROM hospitals WHERE numeric_code IS NULL ORDER BY created_at ASC NULLS LAST, id ASC");

            for (java.util.Map<String, Object> row : nullCoded) {
                Object id = row.get("id");
                Long next = jdbcTemplate.queryForObject(
                    "SELECT nextval('hospital_numeric_code_seq')", Long.class);
                if (next == null || next > 9999) {
                    log.error("❌ Hospital numeric_code sequence exhausted (>9999). Hospital {} left unassigned.", id);
                    break;
                }
                String code = String.format("%04d", next);
                jdbcTemplate.update("UPDATE hospitals SET numeric_code = ? WHERE id = ?", code, id);
                log.info("✅ Assigned numeric_code {} to hospital {}", code, id);
            }
        } catch (Exception e) {
            log.warn("Could not backfill hospital numeric codes: " + e.getMessage());
        }
    }

    private void backfillInvoiceVersions() {
        try {
            int rows = jdbcTemplate.update("UPDATE invoices SET version = 0 WHERE version IS NULL");
            if (rows > 0) log.info("✅ Backfilled version=0 on {} legacy invoice rows", rows);
        } catch (Exception e) {
            log.warn("Could not backfill invoice versions: " + e.getMessage());
        }
        // Same optimistic-lock cursor added to admissions, rooms, and checkup
        // bookings — Hibernate's ddl-auto=update adds the column nullable; we
        // default existing rows to 0 so Hibernate doesn't trip on null version
        // on first read.
        for (String table : new String[] {"admissions", "rooms", "health_checkup_bookings", "prescription_items"}) {
            try {
                jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN IF NOT EXISTS version bigint");
                int rows = jdbcTemplate.update("UPDATE " + table + " SET version = 0 WHERE version IS NULL");
                if (rows > 0) log.info("✅ Backfilled version=0 on {} legacy {} rows", rows, table);
            } catch (Exception e) {
                log.warn("Could not backfill {} versions: {}", table, e.getMessage());
            }
        }
        // Health-checkup invoice link column — auto-billing sets booking.invoice_id
        // pointing at the produced invoice.
        try {
            jdbcTemplate.execute("ALTER TABLE health_checkup_bookings ADD COLUMN IF NOT EXISTS invoice_id uuid");
        } catch (Exception e) {
            log.warn("Could not add health_checkup_bookings.invoice_id: " + e.getMessage());
        }
    }

    private void migrateDischargeData() {
        try {
            // Migrate existing discharge data from legacy columns on admissions into the new discharges table.
            // Runs idempotently — skips admissions that already have a discharge row.
            int rows = jdbcTemplate.update("""
                INSERT INTO discharges (admission_id, actual_discharge_date, discharge_diagnosis, discharge_note, discharged_by, discharged_at)
                SELECT a.id,
                       a.actual_discharge_date,
                       a.discharge_diagnosis,
                       a.discharge_note,
                       'migrated',
                       COALESCE(a.updated_at, NOW())
                FROM admissions a
                WHERE a.status_id = 2
                  AND (a.discharge_diagnosis IS NOT NULL OR a.discharge_note IS NOT NULL OR a.actual_discharge_date IS NOT NULL)
                  AND a.id NOT IN (SELECT admission_id FROM discharges)
                ON CONFLICT DO NOTHING
            """);
            if (rows > 0) log.info("✅ Migrated {} discharge record(s) from admissions → discharges", rows);
        } catch (Exception e) {
            log.warn("Could not migrate discharge data: " + e.getMessage());
        }
    }

    private void ensureZemaRulesSchema() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS public.zema_rules (
                    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id UUID REFERENCES public.hospitals(id),
                    rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('single', 'combination')),
                    metric VARCHAR(50),
                    operator VARCHAR(20) CHECK (operator IN ('lt', 'lte', 'gt', 'gte', 'between', 'eq')),
                    threshold_low NUMERIC(10, 2),
                    threshold_high NUMERIC(10, 2),
                    condition_expr TEXT,
                    label VARCHAR(100) NOT NULL,
                    output_text TEXT NOT NULL,
                    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info', 'reassurance')),
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    sort_hint INTEGER,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """);

            try {
                jdbcTemplate.execute("ALTER TABLE public.zema_rules ENABLE ROW LEVEL SECURITY");
            } catch (Exception e) {
                log.info("RLS might already be enabled on zema_rules: " + e.getMessage());
            }

            try {
                jdbcTemplate.execute("""
                    CREATE POLICY zema_rules_service ON public.zema_rules
                      FOR ALL
                      USING (true)
                      WITH CHECK (true)
                """);
            } catch (Exception e) {
                log.info("Policy zema_rules_service might already exist: " + e.getMessage());
            }
            
            log.info("✅ Ensured zema_rules schema, RLS, and tenant policy");
        } catch (Exception e) {
            log.warn("Could not ensure zema_rules schema: " + e.getMessage());
        }
    }

    private void seedZemaRules() {
        try {
            Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM public.zema_rules WHERE hospital_id IS NULL", Integer.class);
            if (count != null && count > 0) {
                // Check if combination combo rules (C1-C8) already exist
                Integer comboCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM public.zema_rules WHERE hospital_id IS NULL AND rule_type = 'combination' AND metric = 'combo'",
                    Integer.class);
                if (comboCount != null && comboCount > 0) {
                    log.info("ℹ️ Zema rules already seeded (including combo rules) — skipping.");
                    return;
                }
                // Seed only the missing C1-C8 combination rules
                seedCombinationComboRules();
                log.info("✅ Seeded 8 combination combo rules (C1-C8) into existing zema_rules.");
                return;
            }

            // Seed BMI Rules
            insertZemaRule("single", "bmi", "lt", null, 18.5, "Underweight", "BMI is consistent with underweight; consider nutritional support and clinical review for underlying causes.", "warning", 1);
            insertZemaRule("single", "bmi", "between", 18.5, 23.0, "Normal", "BMI is within normal limits; suggest maintaining current healthy lifestyle.", "reassurance", 2);
            insertZemaRule("single", "bmi", "between", 23.0, 25.0, "Overweight at risk", "BMI is consistent with being overweight (at risk); consider lifestyle modifications and dietary counseling.", "warning", 3);
            insertZemaRule("single", "bmi", "gte", 25.0, null, "Obese", "BMI is consistent with obesity; suggest clinical review for associated metabolic risks.", "warning", 4);

            // Seed SpO2 Rules
            insertZemaRule("single", "spo2", "gte", 95.0, null, "Normal", "Oxygen saturation is within normal limits; suggest routine monitoring.", "reassurance", 5);
            insertZemaRule("single", "spo2", "between", 91.0, 95.0, "Mild hypoxemia", "Oxygen saturation is consistent with mild hypoxemia; consider close clinical monitoring and evaluation of respiratory function.", "warning", 6);
            insertZemaRule("single", "spo2", "between", 85.0, 91.0, "Moderate hypoxemia", "Oxygen saturation is consistent with moderate hypoxemia; review respiratory status and consider supplemental oxygen assessment.", "critical", 7);
            insertZemaRule("single", "spo2", "lt", null, 85.0, "Severe hypoxemia", "Oxygen saturation is consistent with severe hypoxemia; critical clinical review and immediate intervention are suggested.", "critical", 8);

            // Seed Pulse Rules
            insertZemaRule("single", "pulse", "lt", null, 60.0, "Bradycardia", "Pulse rate is consistent with bradycardia; consider clinical evaluation and review of active medications.", "warning", 9);
            insertZemaRule("single", "pulse", "between", 60.0, 101.0, "Normal", "Pulse rate is within normal limits; suggest routine monitoring.", "reassurance", 10);
            insertZemaRule("single", "pulse", "gt", 100.0, null, "Tachycardia", "Pulse rate is consistent with tachycardia; consider clinical review for potential triggers like fever, dehydration, or pain.", "warning", 11);

            // Seed Shock Index Rules
            insertZemaRule("single", "shockIndex", "gt", 1.0, null, "Significantly elevated", "Shock index is consistent with significantly elevated risk; critical review for early signs of hypoperfusion is suggested.", "critical", 12);
            insertZemaRule("single", "shockIndex", "between", 0.9, 1.0001, "Elevated", "Shock index is consistent with elevated risk; consider review of volume status and vital sign trends.", "warning", 13);
            insertZemaRule("single", "shockIndex", "between", 0.7, 0.9, "Borderline", "Shock index is consistent with borderline range; suggest ongoing monitoring of hemodynamic trends.", "info", 14);
            insertZemaRule("single", "shockIndex", "between", 0.5, 0.7, "Normal", "Shock index is within the normal range; suggest routine monitoring.", "reassurance", 15);

            // Seed Pulse Pressure Rules
            insertZemaRule("single", "pulsePressure", "lt", null, 25.0, "Narrow", "Pulse pressure is narrow; consider evaluation for low stroke volume or systemic vasoconstriction.", "warning", 16);
            insertZemaRule("single", "pulsePressure", "between", 25.0, 60.0, "Normal", "Pulse pressure is within normal limits; suggest routine monitoring.", "reassurance", 17);
            insertZemaRule("single", "pulsePressure", "gt", 60.0, null, "Wide", "Pulse pressure is wide; consider clinical review for arterial stiffness or high stroke volume states.", "warning", 18);

            // Seed MAP Rules
            insertZemaRule("single", "map", "lt", null, 65.0, "Low perfusion", "Mean arterial pressure is consistent with low perfusion; critical review of organ perfusion and volume status is suggested.", "critical", 19);
            insertZemaRule("single", "map", "between", 65.0, 100.0, "Normal", "Mean arterial pressure is within normal limits; suggest routine monitoring.", "reassurance", 20);
            insertZemaRule("single", "map", "gt", 100.0, null, "Elevated", "Mean arterial pressure is consistent with elevated values; consider monitoring and review of cardiovascular parameters.", "info", 21);

            // Seed Combination Blood Pressure Rules
            insertCombinationRule("bp", "(sbp !== null && sbp < 90) || (map !== null && map < 65)", "Hypotension", "Blood pressure and/or mean arterial pressure are consistent with hypotension; clinical review of perfusion and volume status is suggested.", "critical", 22);
            insertCombinationRule("bp", "(sbp !== null && sbp >= 160) || (dbp !== null && dbp >= 100)", "Stage 2 hypertension", "Blood pressure is consistent with Stage 2 hypertension; urgent clinical review and pharmacotherapy assessment are suggested.", "critical", 23);
            insertCombinationRule("bp", "(sbp !== null && sbp >= 140 && sbp <= 159) || (dbp !== null && dbp >= 90 && dbp <= 99)", "Stage 1 hypertension", "Blood pressure is consistent with Stage 1 hypertension; consider cardiovascular risk assessment and repeat measurements.", "warning", 24);
            insertCombinationRule("bp", "(sbp !== null && sbp >= 120 && sbp <= 139) || (dbp !== null && dbp >= 80 && dbp <= 89)", "High-normal", "Blood pressure is consistent with high-normal range; consider routine blood pressure monitoring and lifestyle modifications.", "info", 25);
            insertCombinationRule("bp", "sbp !== null && dbp !== null && sbp < 120 && dbp < 80", "Normal", "Blood pressure is within the normal range; suggest continuing routine screening.", "reassurance", 26);

            // C1: Cardiometabolic risk cluster
            insertCombinationRule("combo", "bmi !== null && bmi >= 23 && ((sbp !== null && sbp >= 140) || (dbp !== null && dbp >= 90))", "Cardiometabolic risk cluster", "Cardiometabolic risk cluster (elevated BMI + hypertension). Consider HbA1c, fasting lipid profile, and renal function.", "critical", 27);

            // C2: Respiratory compromise
            insertCombinationRule("combo", "spo2 !== null && spo2 < 94 && pulse !== null && pulse > 100", "Respiratory compromise", "Possible respiratory compromise (hypoxemia with tachycardia) - review airway and oxygenation.", "critical", 28);

            // C3: Hemodynamic stress
            insertCombinationRule("combo", "shockIndex !== null && shockIndex > 0.9 && ((sbp !== null && sbp < 100) || (pulse !== null && pulse > 100))", "Hemodynamic stress", "Hemodynamic stress pattern - possible early circulatory compromise. Reassess.", "critical", 29);

            // C4: Wide pulse pressure with age
            insertCombinationRule("combo", "pulsePressure !== null && pulsePressure > 60 && age !== null && age > 60", "Wide pulse pressure with age", "Wide pulse pressure with age - consistent with arterial stiffness.", "warning", 30);

            // C5: Narrow pulse pressure with tachycardia
            insertCombinationRule("combo", "pulsePressure !== null && pulsePressure < 25 && pulse !== null && pulse > 100", "Narrow pulse pressure with tachycardia", "Narrow pulse pressure with tachycardia - possible reduced stroke volume. Review.", "warning", 31);

            // C6: Early hypertension (age < 40)
            insertCombinationRule("combo", "((sbp !== null && sbp >= 140) || (dbp !== null && dbp >= 90)) && age !== null && age < 40", "Early hypertension", "Early-onset hypertension (age < 40) - consider secondary causes (renal, endocrine). Suggest workup.", "warning", 32);

            // C7: Elevated BMI with tachycardia
            insertCombinationRule("combo", "bmi !== null && bmi >= 25 && pulse !== null && pulse > 100", "Elevated BMI with tachycardia", "Elevated BMI with tachycardia - consider metabolic stress, deconditioning, or obstructive sleep apnea screening.", "warning", 33);

            // C8: No acute hemodynamic or respiratory concern (reassurance)
            insertCombinationRule("combo", "sbp !== null && dbp !== null && sbp < 140 && dbp < 90 && (spo2 === null || spo2 >= 95) && (pulse === null || (pulse >= 60 && pulse <= 100)) && (shockIndex === null || shockIndex <= 0.9)", "No acute hemodynamic or respiratory concern", "No acute hemodynamic or respiratory concern identified from current vitals. Routine follow-up suggested.", "reassurance", 34);

            log.info("✅ Zema interpretation rules seeded successfully (34 default rules).");
        } catch (Exception e) {
            log.warn("Could not seed Zema rules: " + e.getMessage());
        }
    }

    private void insertZemaRule(String ruleType, String metric, String operator, Double thresholdLow, Double thresholdHigh, String label, String outputText, String severity, int sortHint) {
        jdbcTemplate.update("""
            INSERT INTO public.zema_rules (rule_type, metric, operator, threshold_low, threshold_high, label, output_text, severity, is_active, sort_hint)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, ?)
        """, ruleType, metric, operator, thresholdLow, thresholdHigh, label, outputText, severity, sortHint);
    }

    private void insertCombinationRule(String metric, String conditionExpr, String label, String outputText, String severity, int sortHint) {
        jdbcTemplate.update("""
            INSERT INTO public.zema_rules (rule_type, metric, condition_expr, label, output_text, severity, is_active, sort_hint)
            VALUES ('combination', ?, ?, ?, ?, ?, true, ?)
        """, metric, conditionExpr, label, outputText, severity, sortHint);
    }

    /**
     * Seeds C1-C8 combination (multi-condition) rules independently.
     * Called when the base 26 rules already exist but the combo rules are missing.
     */
    private void seedCombinationComboRules() {
        insertCombinationRule("combo", "bmi !== null && bmi >= 23 && ((sbp !== null && sbp >= 140) || (dbp !== null && dbp >= 90))", "Cardiometabolic risk cluster", "Cardiometabolic risk cluster (elevated BMI + hypertension). Consider HbA1c, fasting lipid profile, and renal function.", "critical", 27);
        insertCombinationRule("combo", "spo2 !== null && spo2 < 94 && pulse !== null && pulse > 100", "Respiratory compromise", "Possible respiratory compromise (hypoxemia with tachycardia) - review airway and oxygenation.", "critical", 28);
        insertCombinationRule("combo", "shockIndex !== null && shockIndex > 0.9 && ((sbp !== null && sbp < 100) || (pulse !== null && pulse > 100))", "Hemodynamic stress", "Hemodynamic stress pattern - possible early circulatory compromise. Reassess.", "critical", 29);
        insertCombinationRule("combo", "pulsePressure !== null && pulsePressure > 60 && age !== null && age > 60", "Wide pulse pressure with age", "Wide pulse pressure with age - consistent with arterial stiffness.", "warning", 30);
        insertCombinationRule("combo", "pulsePressure !== null && pulsePressure < 25 && pulse !== null && pulse > 100", "Narrow pulse pressure with tachycardia", "Narrow pulse pressure with tachycardia - possible reduced stroke volume. Review.", "warning", 31);
        insertCombinationRule("combo", "((sbp !== null && sbp >= 140) || (dbp !== null && dbp >= 90)) && age !== null && age < 40", "Early hypertension", "Early-onset hypertension (age < 40) - consider secondary causes (renal, endocrine). Suggest workup.", "warning", 32);
        insertCombinationRule("combo", "bmi !== null && bmi >= 25 && pulse !== null && pulse > 100", "Elevated BMI with tachycardia", "Elevated BMI with tachycardia - consider metabolic stress, deconditioning, or obstructive sleep apnea screening.", "warning", 33);
        insertCombinationRule("combo", "sbp !== null && dbp !== null && sbp < 140 && dbp < 90 && (spo2 === null || spo2 >= 95) && (pulse === null || (pulse >= 60 && pulse <= 100)) && (shockIndex === null || shockIndex <= 0.9)", "No acute hemodynamic or respiratory concern", "No acute hemodynamic or respiratory concern identified from current vitals. Routine follow-up suggested.", "reassurance", 34);
    }

    // ───────────────────────────────────────────────────────────────────
    // Blood Bank — schema + system-default lookups
    // ───────────────────────────────────────────────────────────────────

    private void ensureBloodBankSchema() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS blood_bank_lookups (
                    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id   UUID REFERENCES hospitals(id),
                    lookup_type   VARCHAR(24)  NOT NULL,
                    code          VARCHAR(40)  NOT NULL,
                    label         VARCHAR(120) NOT NULL,
                    metadata      JSONB,
                    display_order INTEGER      DEFAULT 0,
                    is_system     BOOLEAN      DEFAULT false,
                    is_active     BOOLEAN      DEFAULT true,
                    created_at    TIMESTAMP    DEFAULT now()
                )
            """);
            jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uniq_blood_bank_lookups_tenant
                    ON blood_bank_lookups (hospital_id, lookup_type, code)
            """);
            jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uniq_blood_bank_lookups_system
                    ON blood_bank_lookups (lookup_type, code) WHERE hospital_id IS NULL
            """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS blood_donors (
                    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id       UUID NOT NULL REFERENCES hospitals(id),
                    donor_code        VARCHAR(30)  NOT NULL,
                    first_name        VARCHAR(100) NOT NULL,
                    last_name         VARCHAR(100),
                    phone             VARCHAR(20),
                    email             VARCHAR(120),
                    dob               DATE,
                    gender            VARCHAR(10),
                    blood_group_code  VARCHAR(40),
                    donor_type_code   VARCHAR(40),
                    address           TEXT,
                    aadhaar_number    VARCHAR(14),
                    patient_id        INTEGER,
                    total_donations   INTEGER      DEFAULT 0,
                    last_donation_date DATE,
                    is_eligible       BOOLEAN      DEFAULT true,
                    notes             TEXT,
                    created_at        TIMESTAMP    DEFAULT now(),
                    updated_at        TIMESTAMP    DEFAULT now(),
                    UNIQUE (hospital_id, donor_code)
                )
            """);
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_blood_donors_hospital ON blood_donors(hospital_id)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_blood_donors_phone ON blood_donors(phone)");

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS blood_units (
                    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id              UUID NOT NULL REFERENCES hospitals(id),
                    bag_number               VARCHAR(60) NOT NULL,
                    blood_group_code         VARCHAR(40) NOT NULL,
                    component_code           VARCHAR(40) NOT NULL,
                    status_code              VARCHAR(40) NOT NULL DEFAULT 'QUARANTINE',
                    source_code              VARCHAR(40) NOT NULL DEFAULT 'IN_HOUSE_DONOR',
                    donor_id                 UUID REFERENCES blood_donors(id),
                    volume_ml                INTEGER,
                    collection_date          DATE,
                    expiry_date              DATE NOT NULL,
                    storage_location         VARCHAR(80),
                    screening_passed         BOOLEAN DEFAULT false,
                    cost_price               NUMERIC(10,2),
                    sale_price               NUMERIC(10,2),
                    issued_to_patient_id     INTEGER,
                    issued_to_admission_id   UUID,
                    issued_by_user_id        UUID,
                    issued_at                TIMESTAMP,
                    issued_doctor_name       VARCHAR(120),
                    replacements_pledged     INTEGER DEFAULT 0,
                    replacements_received    INTEGER DEFAULT 0,
                    invoice_item_id          UUID,
                    notes                    TEXT,
                    created_at               TIMESTAMP DEFAULT now(),
                    updated_at               TIMESTAMP DEFAULT now(),
                    UNIQUE (hospital_id, bag_number)
                )
            """);
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_blood_units_hospital ON blood_units(hospital_id)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_blood_units_group ON blood_units(blood_group_code)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_blood_units_status ON blood_units(status_code)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_blood_units_expiry ON blood_units(expiry_date)");
        } catch (Exception e) {
            log.warn("Blood-bank schema setup: " + e.getMessage());
        }
    }

    private void seedBloodBankLookups() {
        // Blood groups
        upsertBloodBankLookup("BLOOD_GROUP", "A_POS",  "A+",  null, 1);
        upsertBloodBankLookup("BLOOD_GROUP", "A_NEG",  "A−",  null, 2);
        upsertBloodBankLookup("BLOOD_GROUP", "B_POS",  "B+",  null, 3);
        upsertBloodBankLookup("BLOOD_GROUP", "B_NEG",  "B−",  null, 4);
        upsertBloodBankLookup("BLOOD_GROUP", "AB_POS", "AB+", null, 5);
        upsertBloodBankLookup("BLOOD_GROUP", "AB_NEG", "AB−", null, 6);
        upsertBloodBankLookup("BLOOD_GROUP", "O_POS",  "O+",  null, 7);
        upsertBloodBankLookup("BLOOD_GROUP", "O_NEG",  "O−",  null, 8);

        // Components — shelfLifeDays drives the bag's expiry calculation
        upsertBloodBankLookup("COMPONENT", "WHOLE_BLOOD",   "Whole Blood",           "{\"shelfLifeDays\":35,\"defaultVolumeMl\":350}", 1);
        upsertBloodBankLookup("COMPONENT", "PRBC",          "Packed RBC",            "{\"shelfLifeDays\":42,\"defaultVolumeMl\":280}", 2);
        upsertBloodBankLookup("COMPONENT", "FFP",           "Fresh Frozen Plasma",   "{\"shelfLifeDays\":365,\"defaultVolumeMl\":220}", 3);
        upsertBloodBankLookup("COMPONENT", "PLATELETS_RDP", "Platelets (RDP)",       "{\"shelfLifeDays\":5,\"defaultVolumeMl\":60}", 4);
        upsertBloodBankLookup("COMPONENT", "PLATELETS_SDP", "Platelets (SDP)",       "{\"shelfLifeDays\":5,\"defaultVolumeMl\":250}", 5);
        upsertBloodBankLookup("COMPONENT", "CRYO",          "Cryoprecipitate",       "{\"shelfLifeDays\":365,\"defaultVolumeMl\":15}", 6);

        // Unit statuses — color drives the badge tone in the UI
        upsertBloodBankLookup("UNIT_STATUS", "QUARANTINE", "Quarantine", "{\"tone\":\"warning\"}",   1);
        upsertBloodBankLookup("UNIT_STATUS", "AVAILABLE",  "Available",  "{\"tone\":\"success\"}",   2);
        upsertBloodBankLookup("UNIT_STATUS", "RESERVED",   "Reserved",   "{\"tone\":\"info\"}",      3);
        upsertBloodBankLookup("UNIT_STATUS", "ISSUED",     "Issued",     "{\"tone\":\"violet\"}",    4);
        upsertBloodBankLookup("UNIT_STATUS", "EXPIRED",    "Expired",    "{\"tone\":\"neutral\"}",   5);
        upsertBloodBankLookup("UNIT_STATUS", "DISCARDED",  "Discarded",  "{\"tone\":\"danger\"}",    6);

        // Donor types
        upsertBloodBankLookup("DONOR_TYPE", "VOLUNTARY",   "Voluntary",   null, 1);
        upsertBloodBankLookup("DONOR_TYPE", "REPLACEMENT", "Replacement", null, 2);
        upsertBloodBankLookup("DONOR_TYPE", "FAMILY",      "Family",      null, 3);
        upsertBloodBankLookup("DONOR_TYPE", "AUTOLOGOUS",  "Autologous",  null, 4);
        upsertBloodBankLookup("DONOR_TYPE", "PAID",        "Paid",        null, 5);

        // Source — where the bag came from
        upsertBloodBankLookup("SOURCE_TYPE", "IN_HOUSE_DONOR",    "In-house donor",      null, 1);
        upsertBloodBankLookup("SOURCE_TYPE", "EXTERNAL_PURCHASE", "External purchase",   null, 2);

        log.info("✅ Blood bank lookups seeded.");
    }

    /** NULL-safe idempotent upsert — same pattern as the room-type seed. */
    private void upsertBloodBankLookup(String type, String code, String label, String metadataJson, int order) {
        try {
            Integer existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM blood_bank_lookups WHERE hospital_id IS NULL AND lookup_type = ? AND code = ?",
                Integer.class, type, code);
            if (existing != null && existing > 0) {
                jdbcTemplate.update(
                    "UPDATE blood_bank_lookups SET label = ?, metadata = ?::jsonb, display_order = ?, is_system = true " +
                    "WHERE hospital_id IS NULL AND lookup_type = ? AND code = ?",
                    label, metadataJson, order, type, code);
            } else {
                jdbcTemplate.update(
                    "INSERT INTO blood_bank_lookups (hospital_id, lookup_type, code, label, metadata, display_order, is_system, is_active) " +
                    "VALUES (NULL, ?, ?, ?, ?::jsonb, ?, true, true)",
                    type, code, label, metadataJson, order);
            }
        } catch (Exception e) {
            log.warn("Could not seed blood-bank lookup {}/{}: {}", type, code, e.getMessage());
        }
    }

    // ───────────────────────────────────────────────────────────────────
    // Bio-Medical Waste — schema + system-default lookups
    // ───────────────────────────────────────────────────────────────────

    private void ensureBiomedicalWasteSchema() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS biomedical_waste_lookups (
                    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id   UUID REFERENCES hospitals(id),
                    lookup_type   VARCHAR(24)  NOT NULL,
                    code          VARCHAR(40)  NOT NULL,
                    label         VARCHAR(120) NOT NULL,
                    metadata      JSONB,
                    display_order INTEGER      DEFAULT 0,
                    is_system     BOOLEAN      DEFAULT false,
                    is_active     BOOLEAN      DEFAULT true,
                    created_at    TIMESTAMP    DEFAULT now()
                )
            """);
            jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uniq_biomedical_waste_lookups_tenant
                    ON biomedical_waste_lookups (hospital_id, lookup_type, code)
            """);
            jdbcTemplate.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uniq_biomedical_waste_lookups_system
                    ON biomedical_waste_lookups (lookup_type, code) WHERE hospital_id IS NULL
            """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS biomedical_waste_handovers (
                    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id         UUID NOT NULL REFERENCES hospitals(id),
                    handover_date       DATE NOT NULL,
                    vendor_name         VARCHAR(150) NOT NULL,
                    manifest_number     VARCHAR(80),
                    vehicle_number      VARCHAR(40),
                    received_by_name    VARCHAR(120),
                    total_weight_kg     NUMERIC(10,2),
                    category_breakdown  JSONB,
                    cost_amount         NUMERIC(10,2),
                    invoice_number      VARCHAR(80),
                    notes               TEXT,
                    created_by_user_id  UUID REFERENCES users(id),
                    created_at          TIMESTAMP DEFAULT now()
                )
            """);
            jdbcTemplate.execute("ALTER TABLE biomedical_waste_handovers ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(10,2)");
            jdbcTemplate.execute("ALTER TABLE biomedical_waste_handovers ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(80)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_bmw_handovers_hospital ON biomedical_waste_handovers(hospital_id)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_bmw_handovers_date ON biomedical_waste_handovers(handover_date)");

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS biomedical_waste_logs (
                    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    hospital_id            UUID NOT NULL REFERENCES hospitals(id),
                    log_date               DATE NOT NULL,
                    category_code          VARCHAR(40) NOT NULL,
                    generation_point_code  VARCHAR(40) NOT NULL,
                    weight_kg              NUMERIC(8,2) NOT NULL,
                    bag_count              INTEGER,
                    collected_by_user_id   UUID REFERENCES users(id),
                    handover_id            UUID REFERENCES biomedical_waste_handovers(id),
                    notes                  TEXT,
                    created_at             TIMESTAMP DEFAULT now(),
                    updated_at             TIMESTAMP DEFAULT now()
                )
            """);
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_bmw_logs_hospital ON biomedical_waste_logs(hospital_id)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_bmw_logs_date ON biomedical_waste_logs(log_date)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_bmw_logs_category ON biomedical_waste_logs(category_code)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_bmw_logs_handover ON biomedical_waste_logs(handover_id)");
        } catch (Exception e) {
            log.warn("Biomedical-waste schema setup: " + e.getMessage());
        }
    }

    private void seedBiomedicalWasteLookups() {
        // Waste categories — BMWM Rules 2016 Schedule I color codes
        upsertBiomedicalWasteLookup("WASTE_CATEGORY", "YELLOW", "Yellow — Anatomical & soiled waste",
                "{\"color\":\"#facc15\",\"treatment\":\"Incineration / deep burial\"}", 1);
        upsertBiomedicalWasteLookup("WASTE_CATEGORY", "RED", "Red — Contaminated recyclables",
                "{\"color\":\"#ef4444\",\"treatment\":\"Autoclave/microwave + shred\"}", 2);
        upsertBiomedicalWasteLookup("WASTE_CATEGORY", "WHITE", "White — Sharps",
                "{\"color\":\"#94a3b8\",\"treatment\":\"Autoclave + shred / encapsulation\"}", 3);
        upsertBiomedicalWasteLookup("WASTE_CATEGORY", "BLUE", "Blue — Glassware & metal implants",
                "{\"color\":\"#3b82f6\",\"treatment\":\"Disinfection + recycling\"}", 4);

        // Generation points — departments that generate biomedical waste
        upsertBiomedicalWasteLookup("GENERATION_POINT", "OT", "Operation Theatre", null, 1);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "ICU", "ICU", null, 2);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "GENERAL_WARD", "General Ward", null, 3);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "LABOUR_ROOM", "Labour Room", null, 4);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "LABORATORY", "Laboratory", null, 5);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "OPD", "OPD", null, 6);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "PHARMACY", "Pharmacy", null, 7);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "DIALYSIS", "Dialysis Unit", null, 8);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "EMERGENCY", "Emergency", null, 9);
        upsertBiomedicalWasteLookup("GENERATION_POINT", "ISOLATION", "Isolation Ward", null, 10);

        log.info("✅ Biomedical waste lookups seeded.");
    }

    /** NULL-safe idempotent upsert — same pattern as upsertBloodBankLookup. */
    private void upsertBiomedicalWasteLookup(String type, String code, String label, String metadataJson, int order) {
        try {
            Integer existing = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biomedical_waste_lookups WHERE hospital_id IS NULL AND lookup_type = ? AND code = ?",
                Integer.class, type, code);
            if (existing != null && existing > 0) {
                jdbcTemplate.update(
                    "UPDATE biomedical_waste_lookups SET label = ?, metadata = ?::jsonb, display_order = ?, is_system = true " +
                    "WHERE hospital_id IS NULL AND lookup_type = ? AND code = ?",
                    label, metadataJson, order, type, code);
            } else {
                jdbcTemplate.update(
                    "INSERT INTO biomedical_waste_lookups (hospital_id, lookup_type, code, label, metadata, display_order, is_system, is_active) " +
                    "VALUES (NULL, ?, ?, ?, ?::jsonb, ?, true, true)",
                    type, code, label, metadataJson, order);
            }
        } catch (Exception e) {
            log.warn("Could not seed biomedical-waste lookup {}/{}: {}", type, code, e.getMessage());
        }
    }

    /**
     * Seeds the standard Indian GST slabs (0/5/12/18/28%) as per-hospital
     * rate presets, with 18% marked as the default. Skips any hospital that
     * already has gst_rates rows so re-runs and manual edits are preserved.
     */
    private void seedGstRates() {
        try {
            Object[][] defaults = {
                {"GST 0%",  0.0,  0.0,  0.0,  0.0,  0.0, false},
                {"GST 5%",  5.0,  2.5,  2.5,  5.0,  0.0, false},
                {"GST 12%", 12.0, 6.0,  6.0,  12.0, 0.0, false},
                {"GST 18%", 18.0, 9.0,  9.0,  18.0, 0.0, true},
                {"GST 28%", 28.0, 14.0, 14.0, 28.0, 0.0, false},
            };

            Integer existing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM public.gst_rates",
                    Integer.class);
            if (existing != null && existing > 0) {
                return;
            }

            for (Object[] d : defaults) {
                jdbcTemplate.update("""
                    INSERT INTO public.gst_rates
                        (name, rate_percent, cgst_percent, sgst_percent, igst_percent, cess_percent, is_default, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, true)
                """, d[0], d[1], d[2], d[3], d[4], d[5], d[6]);
            }
            log.info("✅ GST rate presets seeded (0/5/12/18/28%).");
        } catch (Exception e) {
            log.warn("Could not seed GST rates: " + e.getMessage());
        }
    }
}
