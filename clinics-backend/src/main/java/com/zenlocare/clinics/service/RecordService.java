package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.HistoryType;
import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.Patient;
import com.zenlocare.clinics.entity.PatientRecord;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.PatientRecordRepository;
import com.zenlocare.clinics.util.PersonNames;
import com.zenlocare.clinics.repository.PatientRepository;
import com.zenlocare.clinics.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Transactional(readOnly = true)
@Service
@RequiredArgsConstructor
public class RecordService {

    private final PatientRecordRepository recordRepository;
    private final PatientRepository patientRepository;
    private final HospitalRepository hospitalRepository;
    private final UserRepository userRepository;
    private final PlatformTransactionManager txManager;

    // Each create-record attempt runs in its own transaction so a UNIQUE-constraint
    // collision can be rolled back and retried cleanly. Built from the autowired
    // transaction manager so we don't need to add a separate bean definition.
    private TransactionTemplate txTemplate;

    @PostConstruct
    void initTxTemplate() {
        this.txTemplate = new TransactionTemplate(txManager);
        this.txTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    private static final int MAX_MRN_ATTEMPTS = 5;

    public List<PatientRecord> getRecordsByPatient(Integer patientId, UUID hospitalId) {
        return recordRepository.findByPatientIdAndHospitalId(patientId, hospitalId);
    }

    public List<PatientRecord> getRecordsByUser(UUID userId, UUID hospitalId) {
        return recordRepository.findByCreatedByIdAndHospitalIdOrderByCreatedAtDesc(userId, hospitalId);
    }

    /** Records of a specific type for a patient, newest first. */
    public List<PatientRecord> getRecordsByPatientAndType(Integer patientId, UUID hospitalId, HistoryType type) {
        return recordRepository.findByPatientIdAndHospitalIdAndHistoryTypeOrderByCreatedAtDesc(
                patientId, hospitalId, type);
    }

    /**
     * Records of a specific type for a patient, scoped to a single admission.
     * Use this when the pharmacy / IPD UI wants only the prescriptions written
     * during the current admission rather than the patient's full history.
     */
    public List<PatientRecord> getRecordsByPatientAndAdmissionAndType(
            Integer patientId, UUID hospitalId, UUID admissionId, HistoryType type) {
        return recordRepository.findByPatientIdAndHospitalIdAndAdmissionIdAndHistoryTypeOrderByCreatedAtDesc(
                patientId, hospitalId, admissionId, type);
    }

    /**
     * Every record tied to a single admission regardless of type, newest
     * first — the full clinical course of the stay. Backs the discharge
     * summary print view (consultations, prescriptions, lab results,
     * surgery notes all rolled into one document).
     */
    public List<PatientRecord> getRecordsByPatientAndAdmission(
            Integer patientId, UUID hospitalId, UUID admissionId) {
        return recordRepository.findByPatientIdAndHospitalIdAndAdmissionIdOrderByCreatedAtDesc(
                patientId, hospitalId, admissionId);
    }

    /** Records tied to a single appointment, newest first. Backs the print view. */
    public List<PatientRecord> getRecordsByAppointment(UUID appointmentId, UUID hospitalId) {
        return recordRepository.findByAppointmentIdAndHospitalIdOrderByCreatedAtDesc(
                appointmentId, hospitalId);
    }

    /**
     * Create a new patient record with a guaranteed-unique MRN.
     *
     * NOT_SUPPORTED suspends the class-level readOnly transaction for this
     * method so each attempt's REQUIRES_NEW inner transaction is unambiguous
     * — there is no outer write TX to be marked rollback-only on a
     * DataIntegrityViolationException. Each attempt at doCreate runs in a
     * fresh, isolated transaction via txTemplate; on a unique-constraint
     * collision on the mrn column the inner TX rolls back cleanly and the
     * next retry recomputes MAX+1 from a fresh read.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public PatientRecord createRecord(UUID hospitalId, Integer patientId, User createdBy,
            String historyType, String description, String instructions,
            LocalDateTime nextVisitDate,
            java.util.UUID admissionId, String admissionNumber,
            java.util.UUID appointmentId,
            java.util.List<com.zenlocare.clinics.controller.RecordController.PrescriptionItemRequest> prescriptionItems,
            UUID attendingDoctorId,
            String soapSubjective, String soapObjective, String soapAssessment, String soapPlan) {

        DataIntegrityViolationException lastError = null;
        for (int attempt = 1; attempt <= MAX_MRN_ATTEMPTS; attempt++) {
            try {
                return txTemplate.execute(status -> doCreate(
                        hospitalId, patientId, createdBy, historyType, description, instructions,
                        nextVisitDate, admissionId, admissionNumber,
                        appointmentId, prescriptionItems, attendingDoctorId,
                        soapSubjective, soapObjective, soapAssessment, soapPlan));
            } catch (DataIntegrityViolationException e) {
                lastError = e;
                log.warn("MRN collision on attempt {} for patient {} at hospital {} — retrying",
                        attempt, patientId, hospitalId);
            }
        }
        throw new RuntimeException(
                "Could not generate a unique MRN after " + MAX_MRN_ATTEMPTS + " attempts", lastError);
    }

    private PatientRecord doCreate(UUID hospitalId, Integer patientId, User createdBy,
            String historyType, String description, String instructions,
            LocalDateTime nextVisitDate,
            java.util.UUID admissionId, String admissionNumber,
            java.util.UUID appointmentId,
            java.util.List<com.zenlocare.clinics.controller.RecordController.PrescriptionItemRequest> prescriptionItems,
            UUID attendingDoctorId,
            String soapSubjective, String soapObjective, String soapAssessment, String soapPlan) {

        Hospital hospital = hospitalRepository.findById(hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Hospital not found"));

        Patient patient = patientRepository.findByIdAndHospitalId(patientId, hospitalId)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));

        // Re-fetch the creator inside this transaction. The @AuthenticationPrincipal
        // User comes in as a detached entity from the JWT filter, and even though
        // User.role is EAGER, Hibernate can produce a Role proxy when re-attaching
        // the detached User during save — which then fails to initialize when the
        // controller maps the saved record to a DTO after this TX closes
        // ("Could not initialize proxy [Role#...] - no session"). Fetching fresh
        // here guarantees a fully-hydrated, currently-managed User with its
        // EAGER role materialised as a real Role instance, not a proxy.
        User creator = userRepository.findById(createdBy.getId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        // Force-touch role inside the TX so any residual proxy is initialised
        // before the entity is read in the controller's DTO mapper.
        if (creator.getRole() != null) creator.getRole().getDisplayName();

        // Resolve the attending doctor if the caller supplied one.
        // Null-safe: staff entering on their own (no attendingDoctorId supplied)
        // simply leaves this field unset; the record is still valid.
        User attendingDoctor = null;
        if (attendingDoctorId != null) {
            attendingDoctor = userRepository.findById(attendingDoctorId).orElse(null);
        }

        String mrn = generateMrn(hospital);

        // Lenient parse — typos / missing values fall back to OTHERS rather than 500ing.
        HistoryType type = HistoryType.fromName(historyType);

        PatientRecord record = PatientRecord.builder()
                .hospital(hospital)
                .patient(patient)
                .createdBy(creator)
                .attendingDoctor(attendingDoctor)
                // Frozen at write time: a clinical record must keep naming who
                // authored it, and in what role, regardless of later renames,
                // promotions, or the person leaving the hospital.
                .createdByNameSnapshot(PersonNames.of(creator))
                .createdByRoleSnapshot(PersonNames.roleOf(creator))
                .attendingDoctorNameSnapshot(PersonNames.of(attendingDoctor))
                .historyType(type)
                .description(description)
                .instructions(instructions)
                .soapSubjective(soapSubjective)
                .soapObjective(soapObjective)
                .soapAssessment(soapAssessment)
                .soapPlan(soapPlan)
                .nextVisitDate(nextVisitDate)
                .admissionId(admissionId)
                .admissionNumber(admissionNumber)
                .appointmentId(appointmentId)
                .mrn(mrn)
                .createdAt(LocalDateTime.now())
                .build();

        // Attach structured prescription items when the record is a PRESCRIPTION.
        // The OPD check-in consultation flow picks PRESCRIPTION as the history
        // type whenever the doctor adds drugs, so the pharmacy's by-type query
        // continues to surface every dispensable record without scanning
        // CONSULTATION rows.
        if (type == HistoryType.PRESCRIPTION && prescriptionItems != null && !prescriptionItems.isEmpty()) {
            int order = 0;
            for (var ir : prescriptionItems) {
                if (ir.getDrugName() == null || ir.getDrugName().isBlank()) continue;
                int qty = ir.getQuantity() != null ? ir.getQuantity() : 0;
                if (qty <= 0) {
                    throw new RuntimeException("Quantity must be positive for drug: " + ir.getDrugName());
                }
                com.zenlocare.clinics.entity.PrescriptionItem item =
                        com.zenlocare.clinics.entity.PrescriptionItem.builder()
                                .record(record)
                                .drugId(ir.getDrugId())
                                .drugName(ir.getDrugName().trim())
                                .drugGeneric(ir.getDrugGeneric())
                                .drugStrength(ir.getDrugStrength())
                                .drugForm(ir.getDrugForm())
                                .dose(ir.getDose())
                                // Convert incoming string codes ("BD", "ORAL") to enum FKs.
                                // fromCode is strict — unknown codes throw with the allowed list
                                // so a bad external caller gets a clear 400, not a silent null.
                                .frequency(com.zenlocare.clinics.entity.PrescriptionFrequency.fromCode(ir.getFrequency()))
                                .durationDays(ir.getDurationDays())
                                .quantity(qty)
                                .route(com.zenlocare.clinics.entity.PrescriptionRoute.fromCode(ir.getRoute()))
                                .instructions(ir.getInstructions())
                                .displayOrder(ir.getDisplayOrder() != null ? ir.getDisplayOrder() : order)
                                .allergyOverrideReason(ir.getAllergyOverrideReason())
                                .replacesPrescriptionItemId(ir.getReplacesPrescriptionItemId())
                                .build();
                record.getPrescriptionItems().add(item);
                order++;
            }
        }

        return recordRepository.save(record);
    }

    /**
     * Generate MRN as {HOSP_PREFIX}MRN-{year}-{seq:5} where seq = MAX(existing
     * mrn sequence for this hospital + year) + 1.
     *
     * Replaces the old `count() + 1 + random(0..99)` generator, which combined
     * a global count() with random jitter and caused UNIQUE-constraint
     * collisions every time the row count caught up with a previously-jittered
     * sequence number:
     *   record #100 saved with random=5 → seq=105 → MRN-00105
     *   record #101 attempts random=4   → seq=105 → COLLISION
     *
     * The concurrent-insert race is handled at the caller — createRecord wraps
     * each attempt in its own REQUIRES_NEW transaction and retries on
     * DataIntegrityViolationException with a fresh MAX query.
     */
    private String generateMrn(Hospital hospital) {
        String year = String.valueOf(LocalDateTime.now().getYear());
        String prefix = HospitalIdPrefix.of(hospital);
        List<String> existing = recordRepository.findMrnsForHospitalAndYear(hospital.getId(), year);
        int maxSeq = existing.stream().mapToInt(this::extractTrailingSequence).max().orElse(0);
        return prefix + String.format("MRN-%s-%05d", year, maxSeq + 1);
    }

    /**
     * Pull the trailing numeric suffix from an MRN. Tolerates both legacy
     * "MRN-2026-00105" and prefixed "1001-MRN-2026-00105" formats — both end
     * in the same dash-delimited integer. Non-numeric or malformed entries
     * return 0 so they're ignored by the MAX calculation.
     */
    private int extractTrailingSequence(String mrn) {
        if (mrn == null) return 0;
        int dash = mrn.lastIndexOf('-');
        if (dash < 0 || dash == mrn.length() - 1) return 0;
        try {
            return Integer.parseInt(mrn.substring(dash + 1));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
