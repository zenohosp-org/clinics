package com.zenlocare.clinics.service;

import com.zenlocare.clinics.dto.DoctorCollectionsDailyResponse;
import com.zenlocare.clinics.dto.DoctorCollectionsSummaryResponse;
import com.zenlocare.clinics.dto.RefundDtos.PendingRefundDto;
import com.zenlocare.clinics.dto.RefundDtos.PendingRefundsResponse;
import com.zenlocare.clinics.entity.Doctor;
import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.repository.DoctorRepository;
import com.zenlocare.clinics.repository.InvoicePaymentRepository;
import com.zenlocare.clinics.repository.InvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Aggregates collected fees (rows in {@code invoice_payments}) per attending
 * doctor for finance dashboards. All windowing is IST-aligned to match the
 * rest of the platform — see {@link DashboardService} for the same convention.
 *
 * Doctor attribution rules:
 *   - OPD: invoice → appointment → doctor
 *   - IPD: invoice → admission  → admitting doctor
 *   - Neither: bucketed under doctorId = null ("Unattributed")
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class FinanceReportService {

    private static final ZoneId HOSPITAL_TZ = ZoneId.of("Asia/Kolkata");
    /** Hard cap on the daily-breakdown window to keep payloads bounded. */
    private static final int MAX_DAILY_RANGE_DAYS = 93;

    private final InvoicePaymentRepository paymentRepo;
    private final DoctorRepository doctorRepo;
    private final InvoiceRepository invoiceRepo;
    private final com.zenlocare.clinics.repository.BankAccountRepository bankAccountRepo;
    private final com.zenlocare.clinics.repository.InvoiceItemRepository invoiceItemRepo;

    // ---------- Summary: today / last 7 days / this month ----------

    public DoctorCollectionsSummaryResponse getSummary(UUID hospitalId, LocalDate asOfOverride) {
        LocalDate asOf = asOfOverride != null ? asOfOverride : LocalDate.now(HOSPITAL_TZ);

        LocalDate todayStart = asOf;
        LocalDate weekStart  = asOf.minusDays(6);          // 7-day inclusive window
        LocalDate monthStart = asOf.withDayOfMonth(1);

        // Query the widest window once (start of month or weekStart, whichever is earlier).
        LocalDate fromDate = monthStart.isBefore(weekStart) ? monthStart : weekStart;
        LocalDateTime fromTs = fromDate.atStartOfDay();
        LocalDateTime toTs   = asOf.plusDays(1).atStartOfDay(); // exclusive end-of-day

        List<Object[]> rows = paymentRepo.sumPaymentsByDoctorPerDay(hospitalId, fromTs, toTs);

        Map<UUID, BigDecimal[]> byDoctor = new HashMap<>(); // doctorId → [today, last7, month]
        BigDecimal[] grand = new BigDecimal[]{ BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO };

        for (Object[] row : rows) {
            UUID doctorId = (UUID) row[0];
            LocalDate payDate = toLocalDate(row[1]);
            BigDecimal amount = toBigDecimal(row[2]);
            if (amount.signum() == 0) continue;

            BigDecimal[] buckets = byDoctor.computeIfAbsent(
                    doctorId,
                    k -> new BigDecimal[]{ BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO });

            if (payDate.equals(todayStart)) {
                buckets[0] = buckets[0].add(amount);
                grand[0]   = grand[0].add(amount);
            }
            if (!payDate.isBefore(weekStart) && !payDate.isAfter(todayStart)) {
                buckets[1] = buckets[1].add(amount);
                grand[1]   = grand[1].add(amount);
            }
            if (!payDate.isBefore(monthStart) && !payDate.isAfter(todayStart)) {
                buckets[2] = buckets[2].add(amount);
                grand[2]   = grand[2].add(amount);
            }
        }

        Map<UUID, Doctor> doctorIndex = loadDoctorIndex(byDoctor.keySet(), hospitalId);

        List<DoctorCollectionsSummaryResponse.DoctorCollectionRow> doctorRows = new ArrayList<>(byDoctor.size());
        for (Map.Entry<UUID, BigDecimal[]> entry : byDoctor.entrySet()) {
            UUID doctorId = entry.getKey();
            BigDecimal[] b = entry.getValue();
            Doctor doctor = doctorId == null ? null : doctorIndex.get(doctorId);
            doctorRows.add(DoctorCollectionsSummaryResponse.DoctorCollectionRow.builder()
                    .doctorId(doctorId)
                    .doctorName(doctorDisplayName(doctor))
                    .specialization(doctor != null ? doctor.getSpecialization() : null)
                    .today(b[0])
                    .last7Days(b[1])
                    .thisMonth(b[2])
                    .build());
        }
        // Sort by thisMonth desc for stable, finance-friendly ordering.
        doctorRows.sort(Comparator.comparing(
                (DoctorCollectionsSummaryResponse.DoctorCollectionRow r) -> r.getThisMonth(),
                Comparator.nullsLast(Comparator.reverseOrder())));

        return DoctorCollectionsSummaryResponse.builder()
                .asOfDate(asOf)
                .todayStart(todayStart)
                .weekStart(weekStart)
                .monthStart(monthStart)
                .doctors(doctorRows)
                .totals(DoctorCollectionsSummaryResponse.Totals.builder()
                        .today(grand[0])
                        .last7Days(grand[1])
                        .thisMonth(grand[2])
                        .build())
                .build();
    }

    // ---------- Daily: per-day breakdown over a range ----------

    public DoctorCollectionsDailyResponse getDaily(UUID hospitalId, LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from and to are required");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("from must be on or before to");
        }
        long span = ChronoUnit.DAYS.between(from, to) + 1;
        if (span > MAX_DAILY_RANGE_DAYS) {
            throw new IllegalArgumentException(
                    "Date range exceeds maximum of " + MAX_DAILY_RANGE_DAYS + " days");
        }

        LocalDateTime fromTs = from.atStartOfDay();
        LocalDateTime toTs   = to.plusDays(1).atStartOfDay();

        List<Object[]> rows = paymentRepo.sumPaymentsByDoctorPerDay(hospitalId, fromTs, toTs);

        // doctorId → (date → amount)
        Map<UUID, Map<LocalDate, BigDecimal>> byDoctorByDay = new HashMap<>();
        for (Object[] row : rows) {
            UUID doctorId = (UUID) row[0];
            LocalDate payDate = toLocalDate(row[1]);
            BigDecimal amount = toBigDecimal(row[2]);
            byDoctorByDay
                    .computeIfAbsent(doctorId, k -> new HashMap<>())
                    .merge(payDate, amount, BigDecimal::add);
        }

        Map<UUID, Doctor> doctorIndex = loadDoctorIndex(byDoctorByDay.keySet(), hospitalId);

        List<LocalDate> dayAxis = new ArrayList<>((int) span);
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            dayAxis.add(d);
        }

        List<DoctorCollectionsDailyResponse.DoctorDailyRow> doctorRows =
                new ArrayList<>(byDoctorByDay.size());
        for (Map.Entry<UUID, Map<LocalDate, BigDecimal>> entry : byDoctorByDay.entrySet()) {
            UUID doctorId = entry.getKey();
            Map<LocalDate, BigDecimal> dayMap = entry.getValue();
            Doctor doctor = doctorId == null ? null : doctorIndex.get(doctorId);

            BigDecimal total = BigDecimal.ZERO;
            List<DoctorCollectionsDailyResponse.DailyAmount> series = new ArrayList<>(dayAxis.size());
            for (LocalDate d : dayAxis) {
                BigDecimal amt = dayMap.getOrDefault(d, BigDecimal.ZERO);
                total = total.add(amt);
                series.add(DoctorCollectionsDailyResponse.DailyAmount.builder()
                        .date(d)
                        .amount(amt)
                        .build());
            }

            doctorRows.add(DoctorCollectionsDailyResponse.DoctorDailyRow.builder()
                    .doctorId(doctorId)
                    .doctorName(doctorDisplayName(doctor))
                    .specialization(doctor != null ? doctor.getSpecialization() : null)
                    .total(total)
                    .daily(series)
                    .build());
        }
        doctorRows.sort(Comparator.comparing(
                (DoctorCollectionsDailyResponse.DoctorDailyRow r) -> r.getTotal(),
                Comparator.nullsLast(Comparator.reverseOrder())));

        return DoctorCollectionsDailyResponse.builder()
                .fromDate(from)
                .toDate(to)
                .doctors(doctorRows)
                .build();
    }

    // ---------- Pending refunds ----------

    /**
     * Invoices where the patient has overpaid — paid_amount > total — typically
     * because a HMS_CREDIT_NOTE (ward return) landed after the invoice was
     * settled. The finance app shows these so a finance user can issue the
     * refund in one click via {@code POST /api/finance/invoices/{id}/refund}.
     *
     * Refund issuance is a separate action (not auto-issued) by design —
     * financial controls require a human to confirm the bank-account debit.
     */
    public PendingRefundsResponse getPendingRefunds(UUID hospitalId) {
        List<Invoice> invoices = invoiceRepo.findOverpaidByHospital(hospitalId);
        List<PendingRefundDto> rows = new ArrayList<>(invoices.size());
        BigDecimal grand = BigDecimal.ZERO;
        for (Invoice inv : invoices) {
            BigDecimal paid = inv.getPaidAmount() != null ? inv.getPaidAmount() : BigDecimal.ZERO;
            BigDecimal total = inv.getTotal()    != null ? inv.getTotal()      : BigDecimal.ZERO;
            BigDecimal refundable = paid.subtract(total);
            if (refundable.signum() <= 0) continue; // race-guard

            var patient = inv.getPatient();
            String name = patient != null
                    ? ((patient.getFirstName() == null ? "" : patient.getFirstName().trim())
                       + " " + (patient.getLastName() == null ? "" : patient.getLastName().trim())).trim()
                    : null;

            rows.add(PendingRefundDto.builder()
                    .invoiceId(inv.getId())
                    .invoiceNumber(inv.getInvoiceNumber())
                    .patientId(patient != null ? patient.getId() : null)
                    .patientName(name)
                    .uhid(patient != null ? patient.getUhid() : null)
                    .admissionId(inv.getAdmission() != null ? inv.getAdmission().getId() : null)
                    .appointmentId(inv.getAppointment() != null ? inv.getAppointment().getId() : null)
                    .billedTotal(total)
                    .paidAmount(paid)
                    .refundableAmount(refundable)
                    .lastUpdated(inv.getUpdatedAt())
                    .build());
            grand = grand.add(refundable);
        }
        return PendingRefundsResponse.builder()
                .invoices(rows)
                .totalRefundable(grand)
                .build();
    }

    // ---------- Refund history ----------

    /**
     * All refunds issued in a date window for this hospital. Pairs with
     * {@code POST /api/finance/invoices/{id}/refund}: every refund issued
     * through that endpoint shows up here for audit.
     *
     * The underlying source is {@code invoice_payments} rows with
     * {@code amount < 0}. We always present {@code amount} as positive in
     * the DTO so the UI doesn't have to flip signs.
     *
     * Default window when both bounds are null: last 7 days ending today
     * (IST). The caller can override either or both via query params.
     * Range is capped at {@code MAX_DAILY_RANGE_DAYS} to keep payloads
     * bounded — same convention as the doctor-collections daily endpoint.
     */
    public com.zenlocare.clinics.dto.RefundDtos.RefundHistoryResponse
            getRefundHistory(UUID hospitalId, LocalDate fromOverride, LocalDate toOverride) {

        LocalDate today = LocalDate.now(HOSPITAL_TZ);
        LocalDate to    = toOverride != null ? toOverride : today;
        LocalDate from  = fromOverride != null ? fromOverride : to.minusDays(6);
        if (from.isAfter(to)) {
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "from must be on or before to");
        }
        long span = ChronoUnit.DAYS.between(from, to) + 1;
        if (span > MAX_DAILY_RANGE_DAYS) {
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "Date range exceeds maximum of " + MAX_DAILY_RANGE_DAYS + " days");
        }

        LocalDateTime fromTs = from.atStartOfDay();
        LocalDateTime toTs   = to.plusDays(1).atStartOfDay();

        List<com.zenlocare.clinics.entity.InvoicePayment> rows =
                paymentRepo.findRefundsInWindow(hospitalId, fromTs, toTs);

        // Batch-resolve bank account names so each row doesn't trigger its own
        // findById call. Most refunds are non-cash so this collapses N round-trips
        // into one IN query.
        Set<UUID> bankIds = new HashSet<>();
        for (var p : rows) if (p.getBankAccountId() != null) bankIds.add(p.getBankAccountId());
        Map<UUID, String> bankNameById = new HashMap<>();
        if (!bankIds.isEmpty()) {
            for (var b : bankAccountRepo.findAllById(bankIds)) {
                bankNameById.put(b.getId(), b.getAccountName());
            }
        }

        List<com.zenlocare.clinics.dto.RefundDtos.RefundHistoryRow> out = new ArrayList<>(rows.size());
        BigDecimal grand = BigDecimal.ZERO;
        for (var p : rows) {
            var invoice = p.getInvoice();
            var patient = invoice != null ? invoice.getPatient() : null;
            BigDecimal amountAbs = p.getAmount() != null ? p.getAmount().abs() : BigDecimal.ZERO;
            String patientName = patient != null
                    ? ((patient.getFirstName() == null ? "" : patient.getFirstName().trim())
                       + " " + (patient.getLastName() == null ? "" : patient.getLastName().trim())).trim()
                    : null;
            boolean isCash = "Cash".equalsIgnoreCase(p.getPaymentMethod())
                    || "CASH".equalsIgnoreCase(p.getPaymentMethod());
            var collector = p.getCollectedByUser();
            String collectorName = collector != null
                    ? ((collector.getFirstName() == null ? "" : collector.getFirstName().trim())
                       + " " + (collector.getLastName() == null ? "" : collector.getLastName().trim())).trim()
                    : p.getCollectedBy();

            out.add(com.zenlocare.clinics.dto.RefundDtos.RefundHistoryRow.builder()
                    .paymentId(p.getId())
                    .invoiceId(invoice != null ? invoice.getId() : null)
                    .invoiceNumber(invoice != null ? invoice.getInvoiceNumber() : null)
                    .patientId(patient != null ? patient.getId() : null)
                    .patientName(patientName)
                    .uhid(patient != null ? patient.getUhid() : null)
                    .amount(amountAbs)
                    .paymentMethod(p.getPaymentMethod())
                    .isCash(isCash)
                    .bankAccountId(p.getBankAccountId())
                    .bankAccountName(p.getBankAccountId() != null
                            ? bankNameById.get(p.getBankAccountId())
                            : null)
                    .collectedById(collector != null ? collector.getId() : null)
                    .collectedByName(collectorName)
                    .notes(p.getNotes())
                    .refundedAt(p.getPaidAt())
                    .build());
            grand = grand.add(amountAbs);
        }
        return com.zenlocare.clinics.dto.RefundDtos.RefundHistoryResponse.builder()
                .refunds(out)
                .totalRefunded(grand)
                .fromDate(from)
                .toDate(to)
                .build();
    }

    // ---------- Return credits feed ----------

    /**
     * Every credit-note line that arrived on this hospital's invoices in a
     * date window — i.e. negative-priced {@code invoice_items} whose
     * {@code pharmacy_bill_id} marks them as pharmacy-sourced. Drives the
     * finance app's "Returns" audit view.
     *
     * Window convention mirrors {@link #getRefundHistory} so the finance UI
     * can share its date-range component: default to last 7 days, hard cap
     * at 93 days, IST-aligned via {@code HOSPITAL_TZ}.
     */
    public com.zenlocare.clinics.dto.RefundDtos.ReturnCreditsResponse
            getReturnCredits(UUID hospitalId, LocalDate fromOverride, LocalDate toOverride) {

        LocalDate today = LocalDate.now(HOSPITAL_TZ);
        LocalDate to    = toOverride != null ? toOverride : today;
        LocalDate from  = fromOverride != null ? fromOverride : to.minusDays(6);
        if (from.isAfter(to)) {
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "from must be on or before to");
        }
        long span = ChronoUnit.DAYS.between(from, to) + 1;
        if (span > MAX_DAILY_RANGE_DAYS) {
            throw new com.zenlocare.clinics.exception.BadRequestException(
                    "Date range exceeds maximum of " + MAX_DAILY_RANGE_DAYS + " days");
        }

        LocalDateTime fromTs = from.atStartOfDay();
        LocalDateTime toTs   = to.plusDays(1).atStartOfDay();

        List<com.zenlocare.clinics.entity.InvoiceItem> rows =
                invoiceItemRepo.findReturnCreditsInWindow(hospitalId, fromTs, toTs);

        List<com.zenlocare.clinics.dto.RefundDtos.ReturnCreditRow> out = new ArrayList<>(rows.size());
        BigDecimal grandAbs = BigDecimal.ZERO;
        for (var item : rows) {
            var inv = item.getInvoice();
            var patient = inv != null ? inv.getPatient() : null;
            BigDecimal amount = item.getTotalPrice() != null ? item.getTotalPrice() : BigDecimal.ZERO;
            String patientName = patient != null
                    ? ((patient.getFirstName() == null ? "" : patient.getFirstName().trim())
                       + " " + (patient.getLastName() == null ? "" : patient.getLastName().trim())).trim()
                    : null;

            out.add(com.zenlocare.clinics.dto.RefundDtos.ReturnCreditRow.builder()
                    .creditId(item.getId())
                    .invoiceId(inv != null ? inv.getId() : null)
                    .invoiceNumber(inv != null ? inv.getInvoiceNumber() : null)
                    .patientName(patientName)
                    .uhid(patient != null ? patient.getUhid() : null)
                    .itemDescription(item.getDescription())
                    .amount(amount)                              // signed, negative
                    .pharmacyBillId(item.getPharmacyBillId())
                    .pharmacyBillNumber(null)                    // pharmacy owns the number; HMS only persists the FK
                    .createdAt(item.getCreatedAt())
                    .invoiceStatus(computeInvoiceStatus(inv))
                    .build());
            grandAbs = grandAbs.add(amount.abs());
        }
        return com.zenlocare.clinics.dto.RefundDtos.ReturnCreditsResponse.builder()
                .returns(out)
                .totalCredited(grandAbs)
                .count(out.size())
                .fromDate(from)
                .toDate(to)
                .build();
    }

    /**
     * Computed status string for finance display. Independent of the
     * persisted {@code invoices.status} enum (which has its own lifecycle
     * including CANCELLED / UNSETTLED) — we collapse to the four states
     * finance actually wants on a credit feed:
     *   UNPAID    nothing collected yet
     *   PARTIAL   some collected, less than billed
     *   SETTLED   exactly paid
     *   OVERPAID  refund is due
     */
    private static String computeInvoiceStatus(com.zenlocare.clinics.entity.Invoice inv) {
        if (inv == null) return null;
        BigDecimal paid  = inv.getPaidAmount() != null ? inv.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal total = inv.getTotal()      != null ? inv.getTotal()      : BigDecimal.ZERO;
        int cmp = paid.compareTo(total);
        if (cmp > 0) return "OVERPAID";
        if (cmp == 0 && paid.signum() > 0) return "SETTLED";
        if (paid.signum() == 0) return "UNPAID";
        return "PARTIAL";
    }

    // ---------- helpers ----------

    private Map<UUID, Doctor> loadDoctorIndex(Set<UUID> doctorIds, UUID hospitalId) {
        Set<UUID> nonNullIds = new HashSet<>();
        for (UUID id : doctorIds) if (id != null) nonNullIds.add(id);
        if (nonNullIds.isEmpty()) return Map.of();

        Map<UUID, Doctor> index = new HashMap<>();
        for (Doctor d : doctorRepo.findAllById(nonNullIds)) {
            // Defense in depth: never leak a doctor row from another hospital
            // even if a stale payment somehow attributes to one.
            if (d.getHospital() != null && hospitalId.equals(d.getHospital().getId())) {
                index.put(d.getId(), d);
            }
        }
        return index;
    }

    private static String doctorDisplayName(Doctor doctor) {
        if (doctor == null) return "Unattributed";
        User u = doctor.getUser();
        if (u == null) return "Doctor";
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last  = u.getLastName()  == null ? "" : u.getLastName().trim();
        String full  = (first + " " + last).trim();
        return full.isEmpty() ? "Doctor" : "Dr. " + full;
    }

    private static LocalDate toLocalDate(Object dbValue) {
        if (dbValue instanceof java.sql.Date d) return d.toLocalDate();
        if (dbValue instanceof LocalDate ld)    return ld;
        if (dbValue instanceof java.util.Date d) {
            return d.toInstant().atZone(HOSPITAL_TZ).toLocalDate();
        }
        throw new IllegalStateException("Unexpected date type from query: " + dbValue);
    }

    private static BigDecimal toBigDecimal(Object dbValue) {
        if (dbValue == null) return BigDecimal.ZERO;
        if (dbValue instanceof BigDecimal bd) return bd;
        if (dbValue instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        throw new IllegalStateException("Unexpected numeric type from query: " + dbValue);
    }
}
