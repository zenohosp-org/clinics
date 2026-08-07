package com.zenlocare.clinics;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zenlocare.clinics.entity.*;
import com.zenlocare.clinics.repository.*;
import com.zenlocare.clinics.scheduler.ClaimAgingScheduler;
import com.zenlocare.clinics.security.JwtUtil;
import com.zenlocare.clinics.service.ClaimService;
import com.zenlocare.clinics.dto.ClaimDtos.TransitionRequest;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Sprint-1 claims verification. Real Spring Boot context, real HTTP through the
 * real security filter chain and controllers, real Hibernate-generated schema on
 * a THROWAWAY local Postgres (profile "verify"). Prints the artifacts required by
 * the ticket's §8 so the run transcript is the evidence.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("verify")
class ClaimSprint1VerificationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JwtUtil jwtUtil;
    @Autowired HospitalRepository hospitalRepo;
    @Autowired RoleRepository roleRepo;
    @Autowired UserRepository userRepo;
    @Autowired PatientRepository patientRepo;
    @Autowired InvoiceRepository invoiceRepo;
    @Autowired PayerRepository payerRepo;
    @Autowired InvoiceClaimRepository claimRepo;
    @Autowired ClaimEventRepository eventRepo;
    @Autowired ClaimService claimService;
    @Autowired PlatformTransactionManager txManager;
    @Autowired ClaimAgingScheduler agingScheduler;

    private static void banner(String s) {
        System.out.println("\n================= " + s + " =================");
    }

    @Test
    void verifySprint1() throws Exception {
        String uniq = Long.toString(System.currentTimeMillis());

        // ── seed prerequisites (real INSERTs) ──
        Hospital hospital = hospitalRepo.save(Hospital.builder()
                .name("Verify Hospital").subdomain("verify-" + uniq).code("VRF" + uniq).build());
        UUID hospitalId = hospital.getId();

        Role role = roleRepo.save(Role.builder().name("finance_admin").displayName("Finance Admin").build());

        User user = userRepo.save(User.builder()
                .email("claims.verify+" + uniq + "@zenohosp.com")
                .firstName("Claims").lastName("Desk")
                .role(role).hospital(hospital).isActive(true).build());

        Patient patient = patientRepo.save(Patient.builder()
                .hospital(hospital).uhid("UHID" + uniq).firstName("Test").lastName("Patient")
                .gender("M").createdAt(LocalDateTime.now()).build());

        Invoice invoice = invoiceRepo.save(Invoice.builder()
                .invoiceNumber("INV-" + uniq).hospital(hospital).patient(patient)
                .subtotal(new BigDecimal("10000.00")).tax(BigDecimal.ZERO).discount(BigDecimal.ZERO)
                .total(new BigDecimal("10000.00")).status(InvoiceStatus.UNPAID).build());

        Payer payer = payerRepo.save(Payer.builder()
                .hospitalId(hospitalId).name("Star Health TPA " + uniq).type("TPA").isActive(true).build());

        String token = jwtUtil.generateToken(user.getEmail(), "finance_admin", hospitalId.toString());
        String bearer = "Bearer " + token;

        // ── create a claim, then SUBMIT it (so it is in SUBMITTED, the QUERY start-state) ──
        String createBody = json.writeValueAsString(new java.util.LinkedHashMap<>() {{
            put("invoiceId", invoice.getId());
            put("payerId", payer.getId());
            put("claimedAmount", 8000.00);
            put("notes", "Cashless admission, orthopaedics.");
        }});
        MvcResult created = mvc.perform(post("/api/finance/claims").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content(createBody))
                .andReturn();
        assertThat(created.getResponse().getStatus()).isEqualTo(200);
        UUID claimId = UUID.fromString(json.readTree(created.getResponse().getContentAsString()).get("id").asText());

        mvc.perform(post("/api/finance/claims/" + claimId + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content("{\"action\":\"SUBMIT\",\"tpaClaimNo\":\"TPA-" + uniq + "\"}"))
                .andReturn();

        // ── §8: raising a query (SUBMITTED → QUERIED) ──
        banner("REQUEST: SUBMITTED -> QUERIED  POST /api/finance/claims/{id}/transition");
        String queryReq = "{\"action\":\"QUERY\",\"notes\":\"Please share the discharge summary and implant sticker.\",\"dueDate\":\"" + java.time.LocalDate.now().plusDays(2) + "\"}";
        System.out.println(queryReq);
        MvcResult queried = mvc.perform(post("/api/finance/claims/" + claimId + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content(queryReq))
                .andReturn();
        banner("RESPONSE (status " + queried.getResponse().getStatus() + ")");
        System.out.println(prettyBody(queried));

        banner("claim_events after QUERY (GET /claims/{id}/events)");
        System.out.println(prettyBody(mvc.perform(get("/api/finance/claims/" + claimId + "/events")
                .header("Authorization", bearer).param("hospitalId", hospitalId.toString())).andReturn()));

        // ── §8: responding (QUERIED → SUBMITTED) ──
        banner("REQUEST: QUERIED -> SUBMITTED  POST /api/finance/claims/{id}/transition");
        String respondReq = "{\"action\":\"RESPOND\",\"notes\":\"Discharge summary + implant sticker uploaded to portal, ref DS-" + uniq + ".\"}";
        System.out.println(respondReq);
        MvcResult responded = mvc.perform(post("/api/finance/claims/" + claimId + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content(respondReq))
                .andReturn();
        banner("RESPONSE (status " + responded.getResponse().getStatus() + ")");
        System.out.println(prettyBody(responded));

        banner("claim_events after RESPOND (full thread, oldest first)");
        System.out.println(prettyBody(mvc.perform(get("/api/finance/claims/" + claimId + "/events")
                .header("Authorization", bearer).param("hospitalId", hospitalId.toString())).andReturn()));

        // Sanity: the raw rows as persisted.
        banner("Raw claim_events rows (repository read)");
        List<ClaimEvent> rows = eventRepo.findByClaim_IdOrderByCreatedAtAsc(claimId);
        for (ClaimEvent e : rows) {
            System.out.printf("  %s | %-15s | actor=%s | due=%s | %s%n",
                    e.getCreatedAt(), e.getEventType(), e.getActorName(), e.getDueDate(), e.getBody());
        }
        assertThat(rows).extracting(ClaimEvent::getEventType)
                .containsSubsequence("STATUS_CHANGE", "STATUS_CHANGE", "QUERY_RAISED", "STATUS_CHANGE", "QUERY_RESPONDED", "STATUS_CHANGE");

        // ── §8: rollback proof — a transition's event is in the SAME transaction ──
        banner("ROLLBACK PROOF: a rolled-back transition writes NO claim_events row");
        InvoiceClaim submitted = claimRepo.findById(claimId).orElseThrow(); // currently SUBMITTED again after RESPOND
        long before = eventRepo.countByClaim_Id(claimId);
        System.out.println("claim status before   = " + submitted.getStatus());
        System.out.println("event count before    = " + before);

        TransactionTemplate tx = new TransactionTemplate(txManager);
        boolean rolledBack = false;
        try {
            tx.execute(status -> {
                TransitionRequest q = new TransitionRequest();
                q.setAction("QUERY");
                q.setNotes("This query must NOT survive — we force a rollback right after.");
                // transition() joins THIS transaction (Propagation.REQUIRED) and writes
                // its QUERY_RAISED + STATUS_CHANGE events here...
                claimService.transition(hospitalId, claimId, q, user);
                // ...then we blow up before commit. Same tx ⇒ the events must roll back too.
                throw new RuntimeException("forced rollback after transition");
            });
        } catch (RuntimeException expected) {
            rolledBack = true;
        }
        long after = eventRepo.countByClaim_Id(claimId);
        String statusAfter = claimRepo.findById(claimId).orElseThrow().getStatus();
        System.out.println("forced rollback fired = " + rolledBack);
        System.out.println("event count after     = " + after + "  (delta " + (after - before) + ")");
        System.out.println("claim status after    = " + statusAfter + "  (unchanged ⇒ status + event rolled back together)");
        assertThat(after).isEqualTo(before);
        assertThat(statusAfter).isEqualTo("SUBMITTED");

        // ── §8: aging job on a real stale claim ──
        banner("AGING JOB: real run with one stale claim (pending_since backdated 10 days)");
        InvoiceClaim stale = claimRepo.findById(claimId).orElseThrow();
        stale.setPendingSince(LocalDateTime.now().minusDays(10)); // SUBMITTED ⇒ pending_with = PAYER
        claimRepo.save(stale);

        Logger jobLogger = (Logger) LoggerFactory.getLogger(ClaimAgingScheduler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        jobLogger.addAppender(appender);
        jobLogger.setLevel(Level.INFO);

        agingScheduler.flagStaleClaims();

        jobLogger.detachAppender(appender);
        for (ILoggingEvent ev : appender.list) {
            System.out.println("  [" + ev.getLevel() + "] " + ev.getFormattedMessage());
        }
        assertThat(appender.list).anyMatch(e ->
                e.getFormattedMessage().contains("STALE") && e.getFormattedMessage().contains(claimId.toString()));

        // ── §8 (negative path): the guards reject as reliably as valid moves accept ──
        // An illegal transition must 400 AND leave claim_events untouched — the mirror
        // image of the rollback proof: a rejected move has no side effects at all.
        banner("NEGATIVE PATH: illegal transitions 400 and write ZERO claim_events rows");

        // (a) RESPOND on a SUBMITTED claim — RESPOND is only legal from QUERIED.
        long evBeforeA = eventRepo.countByClaim_Id(claimId); // claimId is SUBMITTED here
        int statusA = mvc.perform(post("/api/finance/claims/" + claimId + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content("{\"action\":\"RESPOND\",\"notes\":\"should be rejected\"}"))
                .andReturn().getResponse().getStatus();
        long evAfterA = eventRepo.countByClaim_Id(claimId);
        System.out.println("(a) RESPOND on SUBMITTED  → HTTP " + statusA
                + " | events " + evBeforeA + " → " + evAfterA + " (delta " + (evAfterA - evBeforeA) + ")");
        assertThat(statusA).isEqualTo(400);
        assertThat(evAfterA).isEqualTo(evBeforeA);

        // (b) QUERY on a fresh DRAFT claim — QUERY is only legal from SUBMITTED.
        String draftBody = json.writeValueAsString(new java.util.LinkedHashMap<>() {{
            put("invoiceId", invoice.getId());
            put("payerId", payer.getId());
            put("claimedAmount", 1500.00);
        }});
        // The existing SUBMITTED claim on this invoice would block a second open claim,
        // so settle the picture by raising the draft on a second invoice.
        Invoice invoice2 = invoiceRepo.save(Invoice.builder()
                .invoiceNumber("INV2-" + uniq).hospital(hospital).patient(patient)
                .subtotal(new BigDecimal("2000.00")).tax(BigDecimal.ZERO).discount(BigDecimal.ZERO)
                .total(new BigDecimal("2000.00")).status(InvoiceStatus.UNPAID).build());
        String draftBody2 = json.writeValueAsString(new java.util.LinkedHashMap<>() {{
            put("invoiceId", invoice2.getId());
            put("payerId", payer.getId());
            put("claimedAmount", 1500.00);
        }});
        MvcResult draftCreated = mvc.perform(post("/api/finance/claims").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content(draftBody2))
                .andReturn();
        UUID draftId = UUID.fromString(json.readTree(draftCreated.getResponse().getContentAsString()).get("id").asText());
        long evBeforeB = eventRepo.countByClaim_Id(draftId); // the create STATUS_CHANGE only
        int statusB = mvc.perform(post("/api/finance/claims/" + draftId + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content("{\"action\":\"QUERY\",\"notes\":\"should be rejected\"}"))
                .andReturn().getResponse().getStatus();
        long evAfterB = eventRepo.countByClaim_Id(draftId);
        System.out.println("(b) QUERY on DRAFT        → HTTP " + statusB
                + " | events " + evBeforeB + " → " + evAfterB + " (delta " + (evAfterB - evBeforeB) + ")");
        assertThat(statusB).isEqualTo(400);
        assertThat(evAfterB).isEqualTo(evBeforeB);
        // And the DRAFT claim is untouched — still DRAFT, no phantom QUERIED.
        assertThat(claimRepo.findById(draftId).orElseThrow().getStatus()).isEqualTo("DRAFT");

        banner("VERIFICATION COMPLETE — all assertions passed");
    }

    // ════════════════════════════════════════════════════════════════════════
    // Sprint 2a — enhancement requests (REQUEST/APPROVE/DENY_ENHANCEMENT)
    // ════════════════════════════════════════════════════════════════════════
    @Test
    void verifySprint2aEnhancements() throws Exception {
        String uniq = "2a" + System.currentTimeMillis();

        Hospital hospital = hospitalRepo.save(Hospital.builder()
                .name("Enh Hospital").subdomain("enh-" + uniq).code("ENH" + uniq).build());
        UUID hospitalId = hospital.getId();
        Role role = roleRepo.save(Role.builder().name("finance_admin_" + uniq).displayName("Finance Admin").build());
        User user = userRepo.save(User.builder()
                .email("enh.verify+" + uniq + "@zenohosp.com").firstName("Enh").lastName("Desk")
                .role(role).hospital(hospital).isActive(true).build());
        Patient patient = patientRepo.save(Patient.builder()
                .hospital(hospital).uhid("UH" + uniq).firstName("Test").lastName("Patient")
                .gender("M").createdAt(LocalDateTime.now()).build());
        Payer payer = payerRepo.save(Payer.builder()
                .hospitalId(hospitalId).name("Care TPA " + uniq).type("TPA").isActive(true).build());
        // JwtUtil lowercases the role claim; @PreAuthorize checks ROLE_finance_admin,
        // so the token role must be exactly finance_admin regardless of the row name.
        String bearer = "Bearer " + jwtUtil.generateToken(user.getEmail(), "finance_admin", hospitalId.toString());

        // Claim 1 → PARTIALLY_APPROVED at 5000 of 8000 claimed (8000 invoice).
        UUID c1 = createApprovedClaim(hospitalId, bearer, hospital, patient, payer,
                "INV-ENH1-" + uniq, "8000.00", "8000.00", "5000.00");

        banner("NEGATIVE: REQUEST_ENHANCEMENT bounds (≤ approved, > claimed) → 400, zero event delta");
        long e0 = eventRepo.countByClaim_Id(c1);
        int nAtApproved = transitionStatus(c1, hospitalId, bearer,
                "{\"action\":\"REQUEST_ENHANCEMENT\",\"requestedAmount\":5000}"); // == approved
        int nOverClaimed = transitionStatus(c1, hospitalId, bearer,
                "{\"action\":\"REQUEST_ENHANCEMENT\",\"requestedAmount\":9000}"); // > claimed
        long e1 = eventRepo.countByClaim_Id(c1);
        System.out.println("requested==approved(5000) → HTTP " + nAtApproved);
        System.out.println("requested>claimed(9000)   → HTTP " + nOverClaimed);
        System.out.println("events " + e0 + " → " + e1 + " (delta " + (e1 - e0) + ")");
        assertThat(nAtApproved).isEqualTo(400);
        assertThat(nOverClaimed).isEqualTo(400);
        assertThat(e1).isEqualTo(e0);

        banner("REQUEST_ENHANCEMENT (PARTIALLY_APPROVED → ENHANCEMENT_REQUESTED), request 5000 → 7000");
        MvcResult reqd = mvc.perform(post("/api/finance/claims/" + c1 + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content("{\"action\":\"REQUEST_ENHANCEMENT\",\"requestedAmount\":7000}"))
                .andReturn();
        System.out.println(prettyBody(reqd));
        var reqdJson = json.readTree(reqd.getResponse().getContentAsString());
        assertThat(reqdJson.get("status").asText()).isEqualTo("ENHANCEMENT_REQUESTED");
        assertThat(reqdJson.get("pendingWith").asText()).isEqualTo("PAYER");
        assertThat(reqdJson.get("requestedAmount").asDouble()).isEqualTo(7000.0);
        assertThat(reqdJson.get("approvedAmount").asDouble()).isEqualTo(5000.0); // approval NOT yet raised

        banner("SETTLE-GUARD: SETTLE on ENHANCEMENT_REQUESTED → 400, zero side effects");
        UUID invId = claimRepo.findById(c1).orElseThrow().getInvoiceId();
        java.math.BigDecimal paidBefore = nz(invoiceRepo.findById(invId).orElseThrow().getPaidAmount());
        long evBefore = eventRepo.countByClaim_Id(c1);
        int settleStatus = transitionStatus(c1, hospitalId, bearer, "{\"action\":\"SETTLE\",\"settledAmount\":5000}");
        String statusAfter = claimRepo.findById(c1).orElseThrow().getStatus();
        java.math.BigDecimal paidAfter = nz(invoiceRepo.findById(invId).orElseThrow().getPaidAmount());
        long evAfter = eventRepo.countByClaim_Id(c1);
        System.out.println("SETTLE while ENHANCEMENT_REQUESTED → HTTP " + settleStatus);
        System.out.println("claim status: still " + statusAfter);
        System.out.println("invoice paidAmount: " + paidBefore + " → " + paidAfter);
        System.out.println("events: " + evBefore + " → " + evAfter + " (delta " + (evAfter - evBefore) + ")");
        assertThat(settleStatus).isEqualTo(400);
        assertThat(statusAfter).isEqualTo("ENHANCEMENT_REQUESTED");
        assertThat(paidAfter).isEqualByComparingTo(paidBefore);
        assertThat(evAfter).isEqualTo(evBefore);

        banner("NEGATIVE: APPROVE_ENHANCEMENT below prior approved (4000 < 5000) → 400, zero event delta");
        long g0 = eventRepo.countByClaim_Id(c1);
        int belowPrior = transitionStatus(c1, hospitalId, bearer, "{\"action\":\"APPROVE_ENHANCEMENT\",\"approvedAmount\":4000}");
        long g1 = eventRepo.countByClaim_Id(c1);
        System.out.println("granted 4000 (< prior 5000) → HTTP " + belowPrior + " | events delta " + (g1 - g0));
        assertThat(belowPrior).isEqualTo(400);
        assertThat(g1).isEqualTo(g0);

        banner("APPROVE_ENHANCEMENT: raise approved 5000 → 7000");
        MvcResult appr = mvc.perform(post("/api/finance/claims/" + c1 + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content("{\"action\":\"APPROVE_ENHANCEMENT\",\"approvedAmount\":7000}"))
                .andReturn();
        System.out.println(prettyBody(appr));
        var apprJson = json.readTree(appr.getResponse().getContentAsString());
        assertThat(apprJson.get("status").asText()).isEqualTo("PARTIALLY_APPROVED"); // 7000 < 8000 claimed
        assertThat(apprJson.get("approvedAmount").asDouble()).isEqualTo(7000.0);
        assertThat(apprJson.get("pendingWith").asText()).isEqualTo("NONE");
        assertThat(apprJson.get("requestedAmount").isNull()).isTrue(); // cleared

        banner("claim_events after REQUEST + APPROVE enhancement (thread)");
        System.out.println(prettyBody(mvc.perform(get("/api/finance/claims/" + c1 + "/events")
                .header("Authorization", bearer).param("hospitalId", hospitalId.toString())).andReturn()));
        assertThat(eventRepo.findByClaim_IdOrderByCreatedAtAsc(c1)).extracting(ClaimEvent::getEventType)
                .contains("ENHANCEMENT_REQUESTED", "ENHANCEMENT_APPROVED");

        // ── DENY_ENHANCEMENT on a second claim: approved must be UNCHANGED ──
        banner("DENY_ENHANCEMENT: approved amount UNCHANGED, back to prior state");
        UUID c2 = createApprovedClaim(hospitalId, bearer, hospital, patient, payer,
                "INV-ENH2-" + uniq, "6000.00", "6000.00", "4000.00"); // PARTIALLY_APPROVED @ 4000
        transitionStatus(c2, hospitalId, bearer, "{\"action\":\"REQUEST_ENHANCEMENT\",\"requestedAmount\":6000}");
        double approvedBeforeDeny = claimRepo.findById(c2).orElseThrow().getApprovedAmount().doubleValue();
        MvcResult denied = mvc.perform(post("/api/finance/claims/" + c2 + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString())
                        .contentType("application/json").content("{\"action\":\"DENY_ENHANCEMENT\",\"denialReason\":\"No supporting documents\"}"))
                .andReturn();
        var denJson = json.readTree(denied.getResponse().getContentAsString());
        double approvedAfterDeny = denJson.get("approvedAmount").asDouble();
        System.out.println("approved before deny = " + approvedBeforeDeny);
        System.out.println("approved after  deny = " + approvedAfterDeny);
        System.out.println("status after deny    = " + denJson.get("status").asText()
                + " | pendingWith = " + denJson.get("pendingWith").asText()
                + " | requestedAmount null? " + denJson.get("requestedAmount").isNull());
        System.out.println(prettyBody(mvc.perform(get("/api/finance/claims/" + c2 + "/events")
                .header("Authorization", bearer).param("hospitalId", hospitalId.toString())).andReturn()));
        assertThat(approvedAfterDeny).isEqualTo(4000.0).isEqualTo(approvedBeforeDeny);
        assertThat(denJson.get("status").asText()).isEqualTo("PARTIALLY_APPROVED");
        assertThat(denJson.get("pendingWith").asText()).isEqualTo("NONE");
        assertThat(denJson.get("requestedAmount").isNull()).isTrue();

        // ── needs_enhancement computed flag ──
        banner("needs_enhancement flag: true when bill > approved, false otherwise");
        // c2 is PARTIALLY_APPROVED @ 4000, invoice total 6000 → bill outgrew approval → true.
        // A fully-approved claim whose invoice total == approved → false.
        UUID c3 = createApprovedClaim(hospitalId, bearer, hospital, patient, payer,
                "INV-ENH3-" + uniq, "3000.00", "3000.00", "3000.00"); // APPROVED @ 3000, total 3000
        boolean c2Needs = claimNeedsEnhancement(hospitalId, bearer, c2);
        boolean c3Needs = claimNeedsEnhancement(hospitalId, bearer, c3);
        System.out.println("c2 (approved 4000, bill 6000) needsEnhancement = " + c2Needs + "  (expect true)");
        System.out.println("c3 (approved 3000, bill 3000) needsEnhancement = " + c3Needs + "  (expect false)");
        assertThat(c2Needs).isTrue();
        assertThat(c3Needs).isFalse();

        banner("SPRINT 2a VERIFICATION COMPLETE — all assertions passed");
    }

    /** Seeds an invoice + claim and drives it create→SUBMIT→APPROVE. Returns claimId. */
    private UUID createApprovedClaim(UUID hospitalId, String bearer, Hospital hospital, Patient patient, Payer payer,
                                     String invNo, String total, String claimed, String approve) throws Exception {
        Invoice inv = invoiceRepo.save(Invoice.builder()
                .invoiceNumber(invNo).hospital(hospital).patient(patient)
                .subtotal(new java.math.BigDecimal(total)).tax(java.math.BigDecimal.ZERO).discount(java.math.BigDecimal.ZERO)
                .total(new java.math.BigDecimal(total)).status(InvoiceStatus.UNPAID).build());
        String createBody = json.writeValueAsString(new java.util.LinkedHashMap<>() {{
            put("invoiceId", inv.getId());
            put("payerId", payer.getId());
            put("claimedAmount", new java.math.BigDecimal(claimed));
        }});
        MvcResult created = mvc.perform(post("/api/finance/claims").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString()).contentType("application/json").content(createBody))
                .andReturn();
        UUID claimId = UUID.fromString(json.readTree(created.getResponse().getContentAsString()).get("id").asText());
        transitionStatus(claimId, hospitalId, bearer, "{\"action\":\"SUBMIT\"}");
        transitionStatus(claimId, hospitalId, bearer, "{\"action\":\"APPROVE\",\"approvedAmount\":" + approve + "}");
        return claimId;
    }

    /** Fire a transition and return the HTTP status (for negative-path checks). */
    private int transitionStatus(UUID claimId, UUID hospitalId, String bearer, String body) throws Exception {
        return mvc.perform(post("/api/finance/claims/" + claimId + "/transition").header("Authorization", bearer)
                        .param("hospitalId", hospitalId.toString()).contentType("application/json").content(body))
                .andReturn().getResponse().getStatus();
    }

    /** Read a single claim's computed needsEnhancement flag off the list endpoint. */
    private boolean claimNeedsEnhancement(UUID hospitalId, String bearer, UUID claimId) throws Exception {
        MvcResult r = mvc.perform(get("/api/finance/claims").header("Authorization", bearer)
                .param("hospitalId", hospitalId.toString())).andReturn();
        for (var node : json.readTree(r.getResponse().getContentAsString()).get("claims")) {
            if (claimId.toString().equals(node.get("id").asText())) {
                return node.get("needsEnhancement").asBoolean();
            }
        }
        throw new AssertionError("claim " + claimId + " not found in list");
    }

    private static java.math.BigDecimal nz(java.math.BigDecimal v) {
        return v != null ? v : java.math.BigDecimal.ZERO;
    }

    private String prettyBody(MvcResult r) throws Exception {
        String body = r.getResponse().getContentAsString();
        if (body == null || body.isBlank()) return "(empty body, status " + r.getResponse().getStatus() + ")";
        Object tree = json.readValue(body, Object.class);
        return json.writerWithDefaultPrettyPrinter().writeValueAsString(tree);
    }
}
