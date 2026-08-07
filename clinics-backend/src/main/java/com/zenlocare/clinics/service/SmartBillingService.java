package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.SmartBillingSuggestion;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.integration.LabsClient;
import com.zenlocare.clinics.integration.dto.LabsRadiologyOrderDTO;
import com.zenlocare.clinics.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SmartBillingService {

    private final RoomRepository roomRepository;
    private final AppointmentRepository appointmentRepository;
    private final AdmissionRepository admissionRepository;
    private final LabsClient labsClient;

    @Transactional(readOnly = true)
    public SmartBillingSuggestion getSuggestions(Integer patientId, UUID admissionId) {
        LocalDate appointmentFrom = admissionId != null
                ? admissionRepository.findById(admissionId)
                        .map(a -> a.getAdmissionDate().toLocalDate())
                        .orElse(LocalDate.now().minusDays(60))
                : LocalDate.now().minusDays(60);

        // ── Room charge ────────────────────────────────────────────────
        SmartBillingSuggestion.RoomSuggestion roomSuggestion = null;
        Optional<Room> roomOpt = admissionRepository.findByPatientIdAndStatus(patientId, AdmissionStatus.ADMITTED)
                .map(Admission::getRoom);
        if (roomOpt.isPresent()) {
            Room room = roomOpt.get();
            if (room.getPricePerDay() != null && room.getPricePerDay().compareTo(BigDecimal.ZERO) > 0) {
                long days = room.getUpdatedAt() != null
                        ? Math.max(1, ChronoUnit.DAYS.between(room.getUpdatedAt().toLocalDate(), LocalDate.now()))
                        : 1;
                BigDecimal total = room.getPricePerDay().multiply(BigDecimal.valueOf(days));
                roomSuggestion = SmartBillingSuggestion.RoomSuggestion.builder()
                        .roomNumber(room.getRoomNumber())
                        .roomType(room.getRoomType())
                        .pricePerDay(room.getPricePerDay())
                        .daysStayed(days)
                        .totalCharge(total)
                        .build();
            }
        }

        // ── Pending radiology orders ────────────────────────────────────
        // Sourced from labs (api-labs.zenohosp.com /api/radiology). Labs is
        // hospital-scoped, so we fetch the combined PENDING_SCAN +
        // AWAITING_REPORT set for the user's hospital and filter to this
        // patient client-side. JWT must travel with the call so labs validates
        // the same identity HMS just validated.
        List<SmartBillingSuggestion.RadiologySuggestion> radiologySuggestions =
                fetchPendingRadiologyForPatient(patientId);

        // ── Recent appointments (last 60 days, COMPLETED) ───────────────
        List<SmartBillingSuggestion.AppointmentSuggestion> apptSuggestions = new ArrayList<>(
                appointmentRepository.findByPatientIdOrderByApptDateDescApptTimeDesc(patientId)
                        .stream()
                        .filter(a -> a.getStatus() == Appointment.AppointmentStatus.COMPLETED
                                && a.getApptDate() != null
                                && !a.getApptDate().isBefore(appointmentFrom)
                                && !a.getApptDate().isAfter(LocalDate.now()))
                        .map(a -> {
                            Doctor doc = a.getDoctor();
                            String docName = doc.getUser() != null
                                    ? doc.getUser().getFirstName() + (doc.getUser().getLastName() != null ? " " + doc.getUser().getLastName() : "")
                                    : "Unknown";
                            BigDecimal fee = doc.getConsultationFee() != null ? doc.getConsultationFee() : BigDecimal.ZERO;
                            return SmartBillingSuggestion.AppointmentSuggestion.builder()
                                    .appointmentId(a.getId().toString())
                                    .doctorName(docName)
                                    .specialization(doc.getSpecialization())
                                    .consultationFee(fee)
                                    .apptDate(a.getApptDate().toString())
                                    .build();
                        })
                        .collect(Collectors.toList()));

        // ── Source appointment for OPD→IPD conversions ───────────────────
        // The source appointment may still be CONFIRMED (not yet COMPLETED) when the
        // patient is admitted directly from OPD. That status excludes it from the
        // COMPLETED filter above, so we inject it here — always at index 0 — to
        // guarantee the consultation fee surfaces in the IPD bill regardless of status.
        if (admissionId != null) {
            admissionRepository.findById(admissionId).ifPresent(adm -> {
                Appointment src = adm.getSourceAppointment();
                if (src != null && src.getDoctor() != null) {
                    String srcId = src.getId().toString();
                    boolean alreadyPresent = apptSuggestions.stream()
                            .anyMatch(s -> srcId.equals(s.getAppointmentId()));
                    if (!alreadyPresent) {
                        Doctor doc = src.getDoctor();
                        BigDecimal fee = doc.getConsultationFee() != null ? doc.getConsultationFee() : BigDecimal.ZERO;
                        if (fee.compareTo(BigDecimal.ZERO) > 0) {
                            String docName = doc.getUser() != null
                                    ? doc.getUser().getFirstName() + (doc.getUser().getLastName() != null ? " " + doc.getUser().getLastName() : "")
                                    : "Unknown";
                            apptSuggestions.add(0, SmartBillingSuggestion.AppointmentSuggestion.builder()
                                    .appointmentId(srcId)
                                    .doctorName(docName)
                                    .specialization(doc.getSpecialization())
                                    .consultationFee(fee)
                                    .apptDate(src.getApptDate() != null ? src.getApptDate().toString() : null)
                                    .build());
                        }
                    }
                }
            });
        }

        return SmartBillingSuggestion.builder()
                .roomCharge(roomSuggestion)
                .radiologyOrders(radiologySuggestions)
                .appointments(apptSuggestions)
                .build();
    }

    /**
     * Fetches pending + awaiting-report radiology orders for the caller's
     * hospital via labs, narrowed to one patient.
     *
     * Two callers reach this code path with very different auth contexts:
     *  - BillingController → HTTP request → SecurityContext has a real user
     *    and the JWT lives in Authentication.credentials. Labs is called.
     *  - InvoiceSyncScheduler → @Scheduled job → no SecurityContext, no JWT.
     *    Returning an empty list here is safe because the scheduler routes
     *    through computeEstimatedTotal(), which only reads roomCharge and
     *    appointments from the suggestion — radiology was never consumed
     *    on that path, even before the migration.
     */
    private List<SmartBillingSuggestion.RadiologySuggestion> fetchPendingRadiologyForPatient(Integer patientId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return Collections.emptyList();
        String jwt = auth.getCredentials() instanceof String s ? s : null;
        if (jwt == null || jwt.isBlank()) return Collections.emptyList();
        if (!(auth.getPrincipal() instanceof User user)) return Collections.emptyList();
        if (user.getHospital() == null) return Collections.emptyList();
        UUID hospitalId = user.getHospital().getId();

        try {
            List<LabsRadiologyOrderDTO> orders = labsClient.getPendingRadiologyOrders(hospitalId, jwt);
            return orders.stream()
                    .filter(r -> patientId.equals(r.getPatientId()))
                    .map(r -> SmartBillingSuggestion.RadiologySuggestion.builder()
                            .orderId(r.getId())
                            .serviceName(r.getServiceName())
                            .status(r.getStatus())
                            .scheduledDate(r.getScheduledDate() != null ? r.getScheduledDate().toString() : null)
                            .build())
                    .collect(Collectors.toList());
        } catch (Exception e) {
            // Fail-soft: a labs outage shouldn't take down the finalize
            // modal's smart suggestions entirely. Log and return empty.
            log.warn("Labs radiology fetch failed for patient {}: {}", patientId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Computes the full estimated total for an active IPD admission.
     * Combines room charges and completed consultation fees.
     * Returns BigDecimal.ZERO if no admission or room data is found.
     */
    public BigDecimal computeEstimatedTotal(Integer patientId, UUID admissionId) {
        try {
            BigDecimal total = BigDecimal.ZERO;
            SmartBillingSuggestion suggestions = getSuggestions(patientId, admissionId);
            if (suggestions.getRoomCharge() != null && suggestions.getRoomCharge().getTotalCharge() != null) {
                total = total.add(suggestions.getRoomCharge().getTotalCharge());
            }
            if (suggestions.getAppointments() != null) {
                for (SmartBillingSuggestion.AppointmentSuggestion appt : suggestions.getAppointments()) {
                    if (appt.getConsultationFee() != null) {
                        total = total.add(appt.getConsultationFee());
                    }
                }
            }
            return total;
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }
}
