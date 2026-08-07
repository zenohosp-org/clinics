package com.zenlocare.clinics;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.repository.*;
import com.zenlocare.clinics.security.JwtUtil;
import com.zenlocare.clinics.service.BankLedgerService;
import com.zenlocare.clinics.service.ClaimService;
import com.zenlocare.clinics.service.InvoiceService;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Sprint-2b claims verification. Same rig as {@link ClaimSprint1VerificationIT}:
 * real Spring Boot context, real HTTP through the real security filter chain and
 * controllers, real Hibernate schema on a THROWAWAY local Postgres (profile
 * "verify"). The run transcript is the evidence.
 *
 * <p>This file holds §6.1 — the LOAD-BEARING ledger-rollback proof for §1. The
 * only thing mocked is the failure trigger: a {@link MockitoSpyBean} on
 * {@link BankLedgerService} throws on the atomic credit call. Everything else —
 * the transaction manager, the DB, the state we assert — is real. What we prove
 * is that when the settlement's bank-ledger write fails, the WHOLE settlement
 * rolls back and no money lands anywhere.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("verify")
class ClaimSprint2bVerificationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtUtil jwtUtil;
    @Autowired HospitalRepository hospitalRepo;
    @Autowired RoleRepository roleRepo;
    @Autowired UserRepository userRepo;
    @Autowired PatientRepository patientRepo;
    @Autowired InvoiceRepository invoiceRepo;
    @Autowired InvoicePaymentRepository paymentRepo;
    @Autowired PayerRepository payerRepo;
    @Autowired InvoiceClaimRepository claimRepo;
    @Autowired ClaimDeductionLineRepository deductionLineRepo;
    @Autowired BankAccountRepository bankAccountRepo;
    @Autowired BankTransactionRepository bankTxnRepo;
    @Autowired ClaimService claimService;

    /** Failure trigger for §6.1: real bean, one method stubbed to throw. */
    @MockitoSpyBean BankLedgerService bankLedger;
    /**
     * Real event repo, spyable for §6.4 (force the DEDUCTION_NOTED write to fail
     * AFTER the lines are written, to prove they roll back together). Unstubbed it
     * behaves exactly as the real bean; Spring resets it between test methods.
     */
    @MockitoSpyBean ClaimEventRepository eventRepo;

    private static void banner(String s) {
        System.out.println("\n================= " + s + " =================");
    }

    // ════════════════════════════════════════════════════════════════════════
    // §6.1 — LOAD-BEARING: settlement bank-ledger write is atomic with SETTLE
    // ════════════════════════════════════════════════════════════════════════
    @Test
    void verifyLedgerRollbackOnSettle() throws Exception {
        String uniq = "2b" + System.currentTimeMillis();

        Hospital hospital = hospitalRepo.save(Hospital.builder()
                .name("Ledger Hospital").subdomain("ldg-" + uniq).code("LDG" + uniq).build());
        UUID hospitalId = hospital.getId();
        Role role = roleRepo.save(Role.builder().name("finance_admin_" + uniq).displayName("Finance Admin").build());
        User user = userRepo.save(User.builder()
                .email("ledger.verify+" + uniq + "@zenohosp.com").firstName("Ledger").lastName("Desk")
                .role(role).hospital(hospital).isActive(true).build());
        Patient patient = patientRepo.save(Patient.builder()
                .hospital(hospital).uhid("UH" + uniq).firstName("Test").lastName("Patient")
                .gender("M").createdAt(LocalDateTime.now()).build());
        Payer payer = payerRepo.save(Payer.builder()
                .hospitalId(hospitalId).name("Star TPA " + uniq).type("TPA").isActive(true).build());
        Invoice invoice = invoiceRepo.save(Invoice.builder()
                .invoiceNumber("INV-LDG-" + uniq).hospital(hospital).patient(patient)
                .subtotal(new BigDecimal("8000.00")).tax(BigDecimal.ZERO).discount(BigDecimal.ZERO)
                .total(new BigDecimal("8000.00")).status(InvoiceStatus.UNPAID).build());
        BankAccount account = bankAccountRepo.save(BankAccount.builder()
                .hospitalId(hospitalId).accountName("Collections A/C").accountNumber("ACC-" + uniq)
                .openingBalance(BigDecimal.ZERO).build());
        UUID accountId = account.getId();
        // JwtUtil lowercases the role claim; @PreAuthorize checks ROLE_finance_admin.
        String bearer = "Bearer " + jwtUtil.generateToken(user.getEmail(), "finance_admin", hospitalId.toString());

        // Drive a real claim to APPROVED @ 8000 (of 8000 claimed, 8000 invoice).
        UUID claimId = createApprovedClaim(hospitalId, bearer, invoice, payer, "8000.00", "8000.00");
        assertThat(claimRepo.findById(claimId).orElseThrow().getStatus()).isEqualTo("APPROVED");

        String settleBody = "{\"action\":\"SETTLE\",\"settledAmount\":8000,\"bankAccountId\":\"" + accountId + "\"}";

        // ── snapshot before the forced-fail settle ──
        long eventsBefore = eventRepo.countByClaim_Id(claimId);
        BigDecimal paidBefore = nz(invoiceRepo.findById(invoice.getId()).orElseThrow().getPaidAmount());

        // ────────────────────────────────────────────────────────────────────
        // PHASE A — force the ledger write to fail; assert the settlement rolls
        // back and NO partial money lands anywhere.
        // ────────────────────────────────────────────────────────────────────
        banner("§6.1 PHASE A: force bank-ledger write to FAIL during SETTLE → whole settlement must roll back");
        doThrow(new RuntimeException("forced bank-ledger failure (verify)"))
                .when(bankLedger).creditPaymentRequired(any(), any(), any(), any(), any());

        int httpA = mvc.perform(post("/api/finance/claims/" + claimId + "/transition")
                        .header("Authorization", bearer).param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content(settleBody))
                .andReturn().getResponse().getStatus();

        // The atomic credit path was actually reached (we didn't roll back for some other reason).
        verify(bankLedger, atLeastOnce()).creditPaymentRequired(any(), any(), any(), any(), any());

        InvoiceClaim claimAfterA = claimRepo.findById(claimId).orElseThrow();
        Invoice invAfterA = invoiceRepo.findById(invoice.getId()).orElseThrow();
        List<InvoicePayment> paymentsA = paymentRepo.findByInvoice_IdOrderByPaidAtAsc(invoice.getId());
        List<BankTransaction> txnsA = bankTxnRepo.findByBankAccountIdOrderByTransactionDateDesc(accountId);
        long eventsAfterA = eventRepo.countByClaim_Id(claimId);
        boolean anySettledEvent = eventRepo.findByClaim_IdOrderByCreatedAtAsc(claimId).stream()
                .anyMatch(e -> e.getBody() != null && e.getBody().contains("SETTLED"));

        System.out.println("HTTP status            = " + httpA + "  (expect 500 — ledger failure propagated)");
        System.out.println("claim status           = " + claimAfterA.getStatus() + "  (expect APPROVED — NOT settled)");
        System.out.println("claim settledAmount    = " + claimAfterA.getSettledAmount() + "  (expect null)");
        System.out.println("claim settledAt        = " + claimAfterA.getSettledAt() + "  (expect null)");
        System.out.println("invoice paidAmount     = " + nz(invAfterA.getPaidAmount()) + "  (expect " + paidBefore + ")");
        System.out.println("invoice status         = " + invAfterA.getStatus() + "  (expect UNPAID)");
        System.out.println("InvoicePayment rows    = " + paymentsA.size() + "  (expect 0)");
        System.out.println("BankTransaction rows   = " + txnsA.size() + "  (expect 0)");
        System.out.println("claim_events delta     = " + (eventsAfterA - eventsBefore) + "  (expect 0)");
        System.out.println("any SETTLED event      = " + anySettledEvent + "  (expect false)");

        assertThat(httpA).isEqualTo(500);
        assertThat(claimAfterA.getStatus()).isEqualTo("APPROVED");
        assertThat(claimAfterA.getSettledAmount()).isNull();
        assertThat(claimAfterA.getSettledAt()).isNull();
        assertThat(nz(invAfterA.getPaidAmount())).isEqualByComparingTo(paidBefore);
        assertThat(invAfterA.getStatus()).isEqualTo(InvoiceStatus.UNPAID);
        assertThat(paymentsA).isEmpty();
        assertThat(txnsA).isEmpty();
        assertThat(eventsAfterA).isEqualTo(eventsBefore);
        assertThat(anySettledEvent).isFalse();

        // ────────────────────────────────────────────────────────────────────
        // PHASE B — restore the real ledger write; the same SETTLE now commits
        // atomically: exactly one payment, one CREDIT row, no swallow-log.
        // ────────────────────────────────────────────────────────────────────
        banner("§6.1 PHASE B: real ledger write; SETTLE commits atomically (one payment + one CREDIT, no swallow)");
        reset(bankLedger); // spy resumes calling the REAL method; invocation counts reset

        Logger invLogger = (Logger) LoggerFactory.getLogger(InvoiceService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        invLogger.addAppender(appender);
        invLogger.setLevel(Level.ERROR);

        int httpB = mvc.perform(post("/api/finance/claims/" + claimId + "/transition")
                        .header("Authorization", bearer).param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content(settleBody))
                .andReturn().getResponse().getStatus();

        invLogger.detachAppender(appender);

        InvoiceClaim claimAfterB = claimRepo.findById(claimId).orElseThrow();
        Invoice invAfterB = invoiceRepo.findById(invoice.getId()).orElseThrow();
        List<InvoicePayment> paymentsB = paymentRepo.findByInvoice_IdOrderByPaidAtAsc(invoice.getId());
        List<BankTransaction> txnsB = bankTxnRepo.findByBankAccountIdOrderByTransactionDateDesc(accountId);
        BigDecimal netMovement = bankTxnRepo.computeNetMovement(accountId);
        boolean anySwallowLog = appender.list.stream()
                .anyMatch(e -> e.getFormattedMessage().contains("Bank ledger credit failed"));

        System.out.println("HTTP status            = " + httpB + "  (expect 200)");
        System.out.println("claim status           = " + claimAfterB.getStatus() + "  (expect SETTLED)");
        System.out.println("claim settledAmount    = " + claimAfterB.getSettledAmount() + "  (expect 8000.00)");
        System.out.println("invoice paidAmount     = " + nz(invAfterB.getPaidAmount()) + "  (expect 8000.00)");
        System.out.println("invoice status         = " + invAfterB.getStatus() + "  (expect PAID)");
        System.out.println("InvoicePayment rows    = " + paymentsB.size() + "  (expect 1)");
        System.out.println("BankTransaction rows   = " + txnsB.size() + "  (expect 1)");
        System.out.println("bank net movement      = " + netMovement + "  (expect 8000.00)");
        System.out.println("swallow-log emitted?   = " + anySwallowLog + "  (expect false — atomic path, no log-only catch)");

        assertThat(httpB).isEqualTo(200);
        assertThat(claimAfterB.getStatus()).isEqualTo("SETTLED");
        assertThat(nz(claimAfterB.getSettledAmount())).isEqualByComparingTo("8000.00");
        assertThat(nz(invAfterB.getPaidAmount())).isEqualByComparingTo("8000.00");
        assertThat(invAfterB.getStatus()).isEqualTo(InvoiceStatus.PAID);
        assertThat(paymentsB).hasSize(1);
        assertThat(nz(paymentsB.get(0).getAmount())).isEqualByComparingTo("8000.00");
        assertThat(txnsB).hasSize(1);
        assertThat(txnsB.get(0).getType()).isEqualTo("CREDIT");
        assertThat(nz(txnsB.get(0).getAmount())).isEqualByComparingTo("8000.00");
        assertThat(nz(netMovement)).isEqualByComparingTo("8000.00");
        assertThat(anySwallowLog).isFalse();
        // The atomic settlement used the REQUIRED credit path, never the REQUIRES_NEW one.
        verify(bankLedger, times(1)).creditPaymentRequired(any(), any(), any(), any(), any());
        verify(bankLedger, never()).creditPayment(any(), any(), any(), any(), any());

        banner("§6.1 COMPLETE — settlement + bank credit are atomic; failure rolls both back");
    }

    // ════════════════════════════════════════════════════════════════════════
    // §6.2 — LOAD-BEARING: NOTE_DEDUCTION re-labels, invoice outstanding UNCHANGED
    // ════════════════════════════════════════════════════════════════════════
    @Test
    void verifyOutstandingUnchangedOnMarking() throws Exception {
        Ctx ctx = newCtx("62" + System.currentTimeMillis());

        // (A) single RECOVER line = the whole gap.
        banner("§6.2 (A): SETTLE short (approved 8000, settled 6000) then RECOVER 2000 → outstanding UNCHANGED");
        UUID claimA = settledShortClaim(ctx, "INV-62A", "8000.00", "8000.00", "8000", "6000");
        UUID invA = claimRepo.findById(claimA).orElseThrow().getInvoiceId();
        BigDecimal outBeforeA = outstanding(invA);
        BigDecimal totalBeforeA = nz(invoiceRepo.findById(invA).orElseThrow().getTotal());
        BigDecimal paidBeforeA = nz(invoiceRepo.findById(invA).orElseThrow().getPaidAmount());
        BigDecimal advBeforeA = nz(invoiceRepo.findById(invA).orElseThrow().getAdvanceAdjusted());
        long paymentsBeforeA = paymentRepo.findByInvoice_IdOrderByPaidAtAsc(invA).size();

        int httpA = transitionStatus(claimA, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"RECOVER_FROM_PATIENT\",\"amount\":2000,\"reason\":\"Co-pay per policy\"}]}");

        BigDecimal outAfterA = outstanding(invA);
        Invoice invAfterA = invoiceRepo.findById(invA).orElseThrow();
        long paymentsAfterA = paymentRepo.findByInvoice_IdOrderByPaidAtAsc(invA).size();
        System.out.println("HTTP                 = " + httpA + " (expect 200)");
        System.out.println("outstanding          = " + outBeforeA + " → " + outAfterA + " (must be UNCHANGED)");
        System.out.println("total/paid/advance   = " + totalBeforeA + "/" + paidBeforeA + "/" + advBeforeA
                + "  → " + nz(invAfterA.getTotal()) + "/" + nz(invAfterA.getPaidAmount()) + "/" + nz(invAfterA.getAdvanceAdjusted()));
        System.out.println("InvoicePayment rows  = " + paymentsBeforeA + " → " + paymentsAfterA + " (no new charge/payment)");
        System.out.println("deduction lines      = " + deductionLineRepo.countByClaim_Id(claimA) + " (expect 1)");
        assertThat(httpA).isEqualTo(200);
        assertThat(outAfterA).isEqualByComparingTo(outBeforeA);           // THE tripwire
        assertThat(nz(invAfterA.getTotal())).isEqualByComparingTo(totalBeforeA);
        assertThat(nz(invAfterA.getPaidAmount())).isEqualByComparingTo(paidBeforeA);
        assertThat(nz(invAfterA.getAdvanceAdjusted())).isEqualByComparingTo(advBeforeA);
        assertThat(paymentsAfterA).isEqualTo(paymentsBeforeA);            // no new payment row
        assertThat(deductionLineRepo.countByClaim_Id(claimA)).isEqualTo(1);

        // (B) mixed split summing to the gap.
        banner("§6.2 (B): SETTLE short (approved 8000, settled 5000) then WRITE_OFF 1000 + APPEAL 1000 + RECOVER 1000 → outstanding UNCHANGED");
        UUID claimB = settledShortClaim(ctx, "INV-62B", "8000.00", "8000.00", "8000", "5000");
        UUID invB = claimRepo.findById(claimB).orElseThrow().getInvoiceId();
        BigDecimal outBeforeB = outstanding(invB);
        long paymentsBeforeB = paymentRepo.findByInvoice_IdOrderByPaidAtAsc(invB).size();

        int httpB = transitionStatus(claimB, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":["
                + "{\"disposition\":\"WRITE_OFF\",\"amount\":1000,\"reason\":\"Non-payable consumable\"},"
                + "{\"disposition\":\"APPEAL\",\"amount\":1000,\"reason\":\"Tariff dispute\"},"
                + "{\"disposition\":\"RECOVER_FROM_PATIENT\",\"amount\":1000,\"reason\":\"Room-rent differential\"}]}");

        BigDecimal outAfterB = outstanding(invB);
        long paymentsAfterB = paymentRepo.findByInvoice_IdOrderByPaidAtAsc(invB).size();
        System.out.println("HTTP                 = " + httpB + " (expect 200)");
        System.out.println("outstanding          = " + outBeforeB + " → " + outAfterB + " (must be UNCHANGED)");
        System.out.println("InvoicePayment rows  = " + paymentsBeforeB + " → " + paymentsAfterB);
        System.out.println("deduction lines      = " + deductionLineRepo.countByClaim_Id(claimB) + " (expect 3)");
        assertThat(httpB).isEqualTo(200);
        assertThat(outAfterB).isEqualByComparingTo(outBeforeB);
        assertThat(paymentsAfterB).isEqualTo(paymentsBeforeB);
        assertThat(deductionLineRepo.countByClaim_Id(claimB)).isEqualTo(3);

        banner("§6.2 COMPLETE — every disposition re-labels only; invoice outstanding never moves");
    }

    // ════════════════════════════════════════════════════════════════════════
    // §6.3 — negative paths + rounding boundary; each asserts NOTHING persisted
    // ════════════════════════════════════════════════════════════════════════
    @Test
    void verifyNegativePathsAndRounding() throws Exception {
        Ctx ctx = newCtx("63" + System.currentTimeMillis());

        // (a) settled == approved → no deduction to note.
        banner("§6.3 (a): NOTE_DEDUCTION when settled == approved → 400, zero lines");
        UUID full = settledShortClaim(ctx, "INV-63A", "5000.00", "5000.00", "5000", "5000");
        int aStatus = transitionStatus(full, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"WRITE_OFF\",\"amount\":1,\"reason\":\"x\"}]}");
        System.out.println("HTTP " + aStatus + " | lines=" + deductionLineRepo.countByClaim_Id(full));
        assertThat(aStatus).isEqualTo(400);
        assertThat(deductionLineRepo.countByClaim_Id(full)).isZero();

        // Short-paid claim reused for (b)-(d): approved 5000, settled 4000, gap 1000.
        UUID gap1000 = settledShortClaim(ctx, "INV-63B", "5000.00", "5000.00", "5000", "4000");

        // (b) lines don't sum to the gap → reject, nothing persisted.
        banner("§6.3 (b): lines sum 900 ≠ gap 1000 → 400, zero lines");
        int bStatus = transitionStatus(gap1000, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"WRITE_OFF\",\"amount\":900,\"reason\":\"short\"}]}");
        System.out.println("HTTP " + bStatus + " | lines=" + deductionLineRepo.countByClaim_Id(gap1000));
        assertThat(bStatus).isEqualTo(400);
        assertThat(deductionLineRepo.countByClaim_Id(gap1000)).isZero();

        // (c) invalid disposition / blank reason / non-positive amount → reject.
        banner("§6.3 (c): invalid disposition, blank reason, non-positive amount → 400 each, zero lines");
        int badDisp = transitionStatus(gap1000, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"NOPE\",\"amount\":1000,\"reason\":\"x\"}]}");
        int blankReason = transitionStatus(gap1000, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"WRITE_OFF\",\"amount\":1000,\"reason\":\"  \"}]}");
        int badAmount = transitionStatus(gap1000, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"WRITE_OFF\",\"amount\":0,\"reason\":\"x\"}]}");
        System.out.println("badDisp=" + badDisp + " blankReason=" + blankReason + " badAmount=" + badAmount
                + " | lines=" + deductionLineRepo.countByClaim_Id(gap1000));
        assertThat(badDisp).isEqualTo(400);
        assertThat(blankReason).isEqualTo(400);
        assertThat(badAmount).isEqualTo(400);
        assertThat(deductionLineRepo.countByClaim_Id(gap1000)).isZero();

        // (d) rounding boundary — the exact class of HALF_UP drift a sum check hides.
        banner("§6.3 (d): rounding boundary on gap 1000 — 333.33×3=999.99 REJECTS, 333.33+333.33+333.34 PASSES");
        int naive = transitionStatus(gap1000, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":["
                + "{\"disposition\":\"WRITE_OFF\",\"amount\":333.33,\"reason\":\"a\"},"
                + "{\"disposition\":\"WRITE_OFF\",\"amount\":333.33,\"reason\":\"b\"},"
                + "{\"disposition\":\"WRITE_OFF\",\"amount\":333.33,\"reason\":\"c\"}]}");
        System.out.println("naive 999.99 → HTTP " + naive + " | lines=" + deductionLineRepo.countByClaim_Id(gap1000) + " (expect 400 / 0)");
        assertThat(naive).isEqualTo(400);
        assertThat(deductionLineRepo.countByClaim_Id(gap1000)).isZero();

        int exact = transitionStatus(gap1000, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":["
                + "{\"disposition\":\"WRITE_OFF\",\"amount\":333.33,\"reason\":\"a\"},"
                + "{\"disposition\":\"WRITE_OFF\",\"amount\":333.33,\"reason\":\"b\"},"
                + "{\"disposition\":\"WRITE_OFF\",\"amount\":333.34,\"reason\":\"c\"}]}");
        System.out.println("exact 1000.00 → HTTP " + exact + " | lines=" + deductionLineRepo.countByClaim_Id(gap1000) + " (expect 200 / 3)");
        assertThat(exact).isEqualTo(200);
        assertThat(deductionLineRepo.countByClaim_Id(gap1000)).isEqualTo(3);

        // (e) second marking on an already-marked claim → reject.
        banner("§6.3 (e): second NOTE_DEDUCTION on already-marked claim → 400, still 3 lines");
        int second = transitionStatus(gap1000, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"WRITE_OFF\",\"amount\":1000,\"reason\":\"again\"}]}");
        System.out.println("HTTP " + second + " | lines=" + deductionLineRepo.countByClaim_Id(gap1000));
        assertThat(second).isEqualTo(400);
        assertThat(deductionLineRepo.countByClaim_Id(gap1000)).isEqualTo(3);

        // (f) NOTE_DEDUCTION from a non-SETTLED status → reject.
        banner("§6.3 (f): NOTE_DEDUCTION on an APPROVED (not settled) claim → 400, zero lines");
        UUID approvedOnly = createApprovedClaim(ctx.hospitalId, ctx.bearer,
                seedInvoice(ctx, "INV-63F", "5000.00"), ctx.payer, "5000.00", "5000");
        int nonSettled = transitionStatus(approvedOnly, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"WRITE_OFF\",\"amount\":1000,\"reason\":\"x\"}]}");
        System.out.println("HTTP " + nonSettled + " | lines=" + deductionLineRepo.countByClaim_Id(approvedOnly));
        assertThat(nonSettled).isEqualTo(400);
        assertThat(deductionLineRepo.countByClaim_Id(approvedOnly)).isZero();

        banner("§6.3 COMPLETE — guards + exact-sum reject reliably; rejected markings persist nothing");
    }

    // ════════════════════════════════════════════════════════════════════════
    // §6.4 — marking is atomic: lines + DEDUCTION_NOTED event roll back together
    // ════════════════════════════════════════════════════════════════════════
    @Test
    void verifyMarkingAtomicity() throws Exception {
        Ctx ctx = newCtx("64" + System.currentTimeMillis());
        UUID claim = settledShortClaim(ctx, "INV-64", "5000.00", "5000.00", "5000", "4000"); // gap 1000
        UUID invId = claimRepo.findById(claim).orElseThrow().getInvoiceId();

        banner("§6.4: force the DEDUCTION_NOTED event write to FAIL (after lines are saved) → BOTH roll back");
        // Lines are saved BEFORE the event in noteDeduction(); throwing on the event
        // write proves the already-saved lines roll back with it — no orphan lines,
        // no orphan event. Only the DEDUCTION_NOTED save is stubbed; setup events real.
        doThrow(new RuntimeException("forced DEDUCTION_NOTED write failure (verify)"))
                .when(eventRepo).save(argThat(e -> e != null && "DEDUCTION_NOTED".equals(e.getEventType())));

        BigDecimal outBefore = outstanding(invId);
        int http = transitionStatus(claim, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[{\"disposition\":\"WRITE_OFF\",\"amount\":1000,\"reason\":\"eat it\"}]}");

        long lines = deductionLineRepo.countByClaim_Id(claim);
        boolean anyDeductionEvent = eventRepo.findByClaim_IdOrderByCreatedAtAsc(claim).stream()
                .anyMatch(e -> "DEDUCTION_NOTED".equals(e.getEventType()));
        BigDecimal outAfter = outstanding(invId);
        System.out.println("HTTP                    = " + http + " (expect 500)");
        System.out.println("deduction lines persisted = " + lines + " (expect 0 — rolled back with the event)");
        System.out.println("DEDUCTION_NOTED event?    = " + anyDeductionEvent + " (expect false)");
        System.out.println("outstanding             = " + outBefore + " → " + outAfter + " (unchanged)");
        assertThat(http).isEqualTo(500);
        assertThat(lines).isZero();
        assertThat(anyDeductionEvent).isFalse();
        assertThat(outAfter).isEqualByComparingTo(outBefore);

        banner("§6.4 COMPLETE — a failed marking leaves neither lines nor event; append-only integrity holds");
    }

    // ════════════════════════════════════════════════════════════════════════
    // §6.5 — KPI buckets: write-off / appeal (holding) / recover / unmarked
    // ════════════════════════════════════════════════════════════════════════
    @Test
    void verifyDeductionKpis() throws Exception {
        Ctx ctx = newCtx("65" + System.currentTimeMillis());

        UUID a = settledShortClaim(ctx, "INV-65A", "5000.00", "5000.00", "5000", "3000"); // gap 2000
        markOk(ctx, a, "{\"disposition\":\"WRITE_OFF\",\"amount\":2000,\"reason\":\"eaten\"}");
        UUID b = settledShortClaim(ctx, "INV-65B", "4000.00", "4000.00", "4000", "3000"); // gap 1000
        markOk(ctx, b, "{\"disposition\":\"APPEAL\",\"amount\":1000,\"reason\":\"contested\"}");
        UUID c = settledShortClaim(ctx, "INV-65C", "6000.00", "6000.00", "6000", "5000"); // gap 1000
        markOk(ctx, c, "{\"disposition\":\"RECOVER_FROM_PATIENT\",\"amount\":1000,\"reason\":\"co-pay\"}");
        settledShortClaim(ctx, "INV-65D", "5000.00", "5000.00", "5000", "4000");          // gap 1000, UNMARKED

        banner("§6.5: GET /summary deduction buckets (writeOff 2000 | appeal 1000 | recover 1000 | unmarked 1)");
        MvcResult r = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/finance/claims").header("Authorization", ctx.bearer)
                        .param("hospitalId", ctx.hospitalId.toString())).andReturn();
        var s = json.readTree(r.getResponse().getContentAsString());
        System.out.println("deductionWriteOffTotal = " + s.get("deductionWriteOffTotal"));
        System.out.println("deductionAppealTotal   = " + s.get("deductionAppealTotal"));
        System.out.println("deductionRecoverTotal  = " + s.get("deductionRecoverTotal"));
        System.out.println("deductionUnmarkedCount = " + s.get("deductionUnmarkedCount"));
        System.out.println("settledAmount          = " + s.get("settledAmount") + " (3000+3000+5000+4000 = 15000)");
        assertThat(s.get("deductionWriteOffTotal").asDouble()).isEqualTo(2000.0);
        assertThat(s.get("deductionAppealTotal").asDouble()).isEqualTo(1000.0);   // holding: not collected, not lost
        assertThat(s.get("deductionRecoverTotal").asDouble()).isEqualTo(1000.0);
        assertThat(s.get("deductionUnmarkedCount").asLong()).isEqualTo(1L);
        assertThat(s.get("settledAmount").asDouble()).isEqualTo(15000.0);         // appeal NOT double-counted here

        banner("§6.5 COMPLETE — deductions bucketed; appealed amount held separately from collected/lost");
    }

    // ── shared seeding helpers ──

    private record Ctx(Hospital hospital, UUID hospitalId, Patient patient, Payer payer, String bearer) {}

    private Ctx newCtx(String uniq) {
        Hospital hospital = hospitalRepo.save(Hospital.builder()
                .name("Ded Hospital " + uniq).subdomain("ded-" + uniq).code("DED" + uniq).build());
        Role role = roleRepo.save(Role.builder().name("finance_admin_" + uniq).displayName("Finance Admin").build());
        User user = userRepo.save(User.builder()
                .email("ded.verify+" + uniq + "@zenohosp.com").firstName("Ded").lastName("Desk")
                .role(role).hospital(hospital).isActive(true).build());
        Patient patient = patientRepo.save(Patient.builder()
                .hospital(hospital).uhid("UH" + uniq).firstName("Test").lastName("Patient")
                .gender("M").createdAt(LocalDateTime.now()).build());
        Payer payer = payerRepo.save(Payer.builder()
                .hospitalId(hospital.getId()).name("Care TPA " + uniq).type("TPA").isActive(true).build());
        String bearer = "Bearer " + jwtUtil.generateToken(user.getEmail(), "finance_admin", hospital.getId().toString());
        return new Ctx(hospital, hospital.getId(), patient, payer, bearer);
    }

    private Invoice seedInvoice(Ctx ctx, String invNo, String total) {
        return invoiceRepo.save(Invoice.builder()
                .invoiceNumber(invNo + "-" + ctx.hospitalId).hospital(ctx.hospital).patient(ctx.patient)
                .subtotal(new BigDecimal(total)).tax(BigDecimal.ZERO).discount(BigDecimal.ZERO)
                .total(new BigDecimal(total)).status(InvoiceStatus.UNPAID).build());
    }

    /** create→SUBMIT→APPROVE→SETTLE(settle) on a fresh invoice; leaves the claim SETTLED. */
    private UUID settledShortClaim(Ctx ctx, String invNo, String total, String claimed,
                                   String approve, String settle) throws Exception {
        Invoice inv = seedInvoice(ctx, invNo, total);
        UUID claimId = createApprovedClaim(ctx.hospitalId, ctx.bearer, inv, ctx.payer, claimed, approve);
        transitionStatus(claimId, ctx.hospitalId, ctx.bearer, "{\"action\":\"SETTLE\",\"settledAmount\":" + settle + "}");
        return claimId;
    }

    private void markOk(Ctx ctx, UUID claimId, String line) throws Exception {
        int http = transitionStatus(claimId, ctx.hospitalId, ctx.bearer,
                "{\"action\":\"NOTE_DEDUCTION\",\"deductions\":[" + line + "]}");
        assertThat(http).isEqualTo(200);
    }

    private BigDecimal outstanding(UUID invoiceId) {
        Invoice i = invoiceRepo.findById(invoiceId).orElseThrow();
        return nz(i.getTotal()).subtract(nz(i.getPaidAmount())).subtract(nz(i.getAdvanceAdjusted()));
    }

    /** Seeds a claim on the given invoice and drives it create→SUBMIT→APPROVE. Returns claimId. */
    private UUID createApprovedClaim(UUID hospitalId, String bearer, Invoice invoice, Payer payer,
                                     String claimed, String approve) throws Exception {
        String createBody = json.writeValueAsString(new java.util.LinkedHashMap<>() {{
            put("invoiceId", invoice.getId());
            put("payerId", payer.getId());
            put("claimedAmount", new BigDecimal(claimed));
        }});
        MvcResult created = mvc.perform(post("/api/finance/claims").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString()).contentType("application/json").content(createBody))
                .andReturn();
        UUID claimId = UUID.fromString(json.readTree(created.getResponse().getContentAsString()).get("id").asText());
        transitionStatus(claimId, hospitalId, bearer, "{\"action\":\"SUBMIT\"}");
        transitionStatus(claimId, hospitalId, bearer, "{\"action\":\"APPROVE\",\"approvedAmount\":" + approve + "}");
        return claimId;
    }

    private int transitionStatus(UUID claimId, UUID hospitalId, String bearer, String body) throws Exception {
        return mvc.perform(post("/api/finance/claims/" + claimId + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString()).contentType("application/json").content(body))
                .andReturn().getResponse().getStatus();
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
