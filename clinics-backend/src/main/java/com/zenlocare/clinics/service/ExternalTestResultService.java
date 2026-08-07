package com.zenlocare.clinics.service;

import com.zenlocare.clinics.entity.ExternalTestResult;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.BadRequestException;
import com.zenlocare.clinics.exception.UnauthorizedException;
import com.zenlocare.clinics.repository.ExternalTestResultRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;

/**
 * Creation + listing of external_test_results. No update path:
 * append-only, mirroring the rest of this feature. A correction is a
 * new row, never a mutation of the original.
 *
 * Tenant scoping via the same assertSameHospital pattern as
 * AttachmentService; the controller passes hospitalId from the
 * request body and we cross-check it against the JWT principal.
 */
@Service
@RequiredArgsConstructor
public class ExternalTestResultService {

    private final ExternalTestResultRepository repo;

    private static final Set<String> ALLOWED_CATEGORY = Set.of(
            "LAB", "RADIOLOGY", "PATHOLOGY", "OTHER");

    @Transactional
    public ExternalTestResult create(
            UUID hospitalId, Integer patientId, UUID recordId, UUID appointmentId,
            String category, String testName, String testCode,
            String resultValue, String resultUnit, String referenceRange,
            Boolean isAbnormal, LocalDate testDate,
            String sourceName, String sourceDoctorName,
            UUID attachmentId, String notes,
            User principal) {

        assertSameHospital(hospitalId, principal);
        if (!ALLOWED_CATEGORY.contains(category)) {
            throw new BadRequestException("Unsupported test category: " + category);
        }

        ExternalTestResult row = ExternalTestResult.builder()
                .hospitalId(hospitalId)
                .patientId(patientId)
                .recordId(recordId)
                .appointmentId(appointmentId)
                .category(category)
                .testName(testName)
                .testCode(testCode)
                .resultValue(resultValue)
                .resultUnit(resultUnit)
                .referenceRange(referenceRange)
                .isAbnormal(isAbnormal)
                .testDate(testDate)
                .sourceName(sourceName)
                .sourceDoctorName(sourceDoctorName)
                .attachmentId(attachmentId)
                .notes(notes)
                .createdBy(principal.getId())
                .build();
        return repo.save(row);
    }

    @Transactional(readOnly = true)
    public Page<ExternalTestResult> listForPatient(
            UUID hospitalId, Integer patientId, String category,
            LocalDate from, LocalDate to, Pageable pageable, User principal) {
        assertSameHospital(hospitalId, principal);
        return repo.listForPatient(hospitalId, patientId, category, from, to, pageable);
    }

    @Transactional(readOnly = true)
    public java.util.List<ExternalTestResult> listForAppointment(
            UUID appointmentId, UUID hospitalId, User principal) {
        assertSameHospital(hospitalId, principal);
        return repo.findByAppointmentIdAndHospitalIdOrderByCreatedAtDesc(appointmentId, hospitalId);
    }

    private void assertSameHospital(UUID requestedHospitalId, User principal) {
        if (principal == null) throw new UnauthorizedException("Not authenticated");
        if (principal.getRole() != null && "super_admin".equalsIgnoreCase(principal.getRole().getName())) {
            return;
        }
        UUID principalHospitalId = principal.getHospital() != null
                ? principal.getHospital().getId()
                : null;
        if (principalHospitalId == null || !principalHospitalId.equals(requestedHospitalId)) {
            throw new UnauthorizedException("Cross-tenant access denied");
        }
    }
}
