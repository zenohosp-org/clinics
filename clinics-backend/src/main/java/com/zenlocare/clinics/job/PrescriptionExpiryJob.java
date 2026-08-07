package com.zenlocare.clinics.job;

import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.HistoryType;
import com.zenlocare.clinics.entity.PatientRecord;
import com.zenlocare.clinics.entity.PrescriptionDispenseStatus;
import com.zenlocare.clinics.entity.PrescriptionItem;
import com.zenlocare.clinics.repository.HospitalRepository;
import com.zenlocare.clinics.repository.PatientRecordRepository;
import com.zenlocare.clinics.repository.PrescriptionItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class PrescriptionExpiryJob {

    private final HospitalRepository hospitalRepository;
    private final PatientRecordRepository patientRecordRepository;
    private final PrescriptionItemRepository prescriptionItemRepository;

    /**
     * Runs every hour to find OPD prescriptions older than the hospital's
     * configured expiry window and marks unsold lines as NOT_DISPENSED.
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void expireOldOpdPrescriptions() {
        log.info("Running OPD Prescription auto-expiry job...");
        List<Hospital> activeHospitals = hospitalRepository.findAll(); // Assuming small number of hospitals
        for (Hospital hospital : activeHospitals) {
            if (!Boolean.TRUE.equals(hospital.getIsActive())) continue;

            int expiryHours = hospital.getOpdPrescriptionExpiryHours() != null ? 
                              hospital.getOpdPrescriptionExpiryHours() : 48;

            LocalDateTime cutoffTime = LocalDateTime.now().minusHours(expiryHours);

            // Fetch OPD prescriptions (admissionId is null)
            List<PatientRecord> opdRecords = patientRecordRepository
                    .findByHospitalIdAndHistoryTypeAndAdmissionIdIsNullOrderByCreatedAtDesc(
                            hospital.getId(), HistoryType.PRESCRIPTION);

            for (PatientRecord record : opdRecords) {
                // If it's older than cutoff
                if (record.getCreatedAt().isBefore(cutoffTime)) {
                    boolean updated = false;
                    for (PrescriptionItem pi : record.getPrescriptionItems()) {
                        if (pi.getDispenseStatus() == PrescriptionDispenseStatus.PENDING) {
                            pi.setDispenseStatus(PrescriptionDispenseStatus.NOT_DISPENSED);
                            pi.setNotDispensedReason("Expired");
                            prescriptionItemRepository.save(pi);
                            updated = true;
                        }
                    }
                    if (updated) {
                        log.info("Expired OPD prescription {} for hospital {}", record.getId(), hospital.getCode());
                    }
                }
            }
        }
        log.info("Finished OPD Prescription auto-expiry job.");
    }
}
