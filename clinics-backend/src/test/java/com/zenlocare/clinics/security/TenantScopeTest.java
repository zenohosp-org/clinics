package com.zenlocare.clinics.security;

import com.zenlocare.clinics.entity.Hospital;
import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.entity.InvoiceItem;
import com.zenlocare.clinics.entity.Patient;
import com.zenlocare.clinics.entity.PriceList;
import com.zenlocare.clinics.entity.PriceListItem;
import com.zenlocare.clinics.entity.Role;
import com.zenlocare.clinics.entity.User;
import com.zenlocare.clinics.exception.ResourceNotFoundException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerMapping;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** One hospital must never reach another's records, whichever way the id arrives. */
class TenantScopeTest {

    private final UUID ours = UUID.randomUUID();
    private final UUID theirs = UUID.randomUUID();
    private final HospitalAccessGuard guard = new HospitalAccessGuard();
    private final TenantScopeInterceptor interceptor = new TenantScopeInterceptor(guard);
    private final TenantBodyAdvice bodyAdvice = new TenantBodyAdvice(guard);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final RecordOwnership ownership = new RecordOwnership(guard, entityManager);

    private void signIn(String roleName, UUID hospitalId) {
        Role role = new Role();
        role.setName(roleName);
        User user = new User();
        user.setRole(role);
        if (hospitalId != null) {
            Hospital h = new Hospital();
            h.setId(hospitalId);
            user.setHospital(h);
        }
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, "token", List.of()));
    }

    @AfterEach
    void signOut() {
        SecurityContextHolder.clearContext();
    }

    private MockHttpServletRequest request(String query, String pathVar) {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/patients");
        if (query != null) req.setParameter("hospitalId", query);
        if (pathVar != null) req.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, Map.of("hospitalId", pathVar));
        return req;
    }

    @Test
    void aHospitalNamedInTheRequest_mustBeTheCallersOwn() {
        signIn("staff", ours);
        assertDoesNotThrow(() -> interceptor.preHandle(request(ours.toString(), null), new MockHttpServletResponse(), null));
        assertDoesNotThrow(() -> interceptor.preHandle(request(null, null), new MockHttpServletResponse(), null));
        assertThrows(AccessDeniedException.class,
                () -> interceptor.preHandle(request(theirs.toString(), null), new MockHttpServletResponse(), null));
        assertThrows(AccessDeniedException.class,
                () -> interceptor.preHandle(request(null, theirs.toString()), new MockHttpServletResponse(), null));
        assertThrows(AccessDeniedException.class,
                () -> interceptor.preHandle(request("not-a-uuid", null), new MockHttpServletResponse(), null));
    }

    @Test
    void aSuperAdmin_mayNameAnyHospital() {
        signIn("super_admin", null);
        assertDoesNotThrow(() -> interceptor.preHandle(request(theirs.toString(), null), new MockHttpServletResponse(), null));
    }

    /** A request body shaped like the ones the controllers take. */
    public static class Body {
        private UUID hospitalId;
        public UUID getHospitalId() { return hospitalId; }
        public void setHospitalId(UUID hospitalId) { this.hospitalId = hospitalId; }
    }

    public record ReadOnlyBody(UUID hospitalId) { }

    @Test
    void aHospitalInTheBody_isPinnedToTheCallersOwn() {
        signIn("staff", ours);
        Body body = new Body();
        body.setHospitalId(theirs);
        bodyAdvice.pin(body);
        assertEquals(ours, body.getHospitalId());

        Body blank = new Body();
        bodyAdvice.pin(blank);
        assertEquals(ours, blank.getHospitalId());

        assertThrows(AccessDeniedException.class, () -> bodyAdvice.pin(new ReadOnlyBody(theirs)));
        assertDoesNotThrow(() -> bodyAdvice.pin(new ReadOnlyBody(ours)));
        assertDoesNotThrow(() -> bodyAdvice.pin("a plain string body"));
    }

    @Test
    void aSuperAdminsBody_isLeftAlone() {
        signIn("super_admin", null);
        Body body = new Body();
        body.setHospitalId(theirs);
        bodyAdvice.pin(body);
        assertEquals(theirs, body.getHospitalId());
    }

    private Patient patientOf(UUID hospitalId) {
        Hospital h = new Hospital();
        h.setId(hospitalId);
        Patient p = new Patient();
        p.setHospital(h);
        return p;
    }

    @Test
    void anotherHospitalsRecord_looksLikeItDoesNotExist() {
        signIn("staff", ours);
        when(entityManager.find(Patient.class, 1)).thenReturn(patientOf(ours));
        when(entityManager.find(Patient.class, 2)).thenReturn(patientOf(theirs));
        when(entityManager.find(Patient.class, 3)).thenReturn(null);

        assertDoesNotThrow(() -> ownership.require(Patient.class, 1));
        ResourceNotFoundException foreign = assertThrows(ResourceNotFoundException.class, () -> ownership.require(Patient.class, 2));
        ResourceNotFoundException missing = assertThrows(ResourceNotFoundException.class, () -> ownership.require(Patient.class, 3));
        assertEquals(missing.getMessage(), foreign.getMessage());
    }

    @Test
    void aRecordWithoutItsOwnHospital_isJudgedByItsParent() {
        Hospital h = new Hospital();
        h.setId(theirs);
        PriceList list = new PriceList();
        list.setHospital(h);
        PriceListItem item = new PriceListItem();
        item.setPriceList(list);
        assertEquals(theirs, RecordOwnership.hospitalOf(item, 0));

        Invoice invoice = new Invoice();
        invoice.setHospital(h);
        InvoiceItem line = new InvoiceItem();
        line.setInvoice(invoice);
        assertEquals(theirs, RecordOwnership.hospitalOf(line, 0));

        assertNull(RecordOwnership.hospitalOf(new PriceListItem(), 0));
    }

    @Test
    void noLogin_isRefused() {
        assertThrows(AccessDeniedException.class, () -> guard.currentHospitalId());
    }
}
