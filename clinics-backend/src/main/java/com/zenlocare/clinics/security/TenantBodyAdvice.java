package com.zenlocare.clinics.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.PropertyAccessorFactory;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

import java.lang.reflect.Type;
import java.util.UUID;

/**
 * A request body that names a {@code hospitalId} is pinned to the caller's
 * own hospital before the controller sees it. Creating a patient, invoice,
 * admission or record in another hospital is otherwise one field away. A
 * super admin's body is left as sent.
 */
@ControllerAdvice
@RequiredArgsConstructor
public class TenantBodyAdvice extends RequestBodyAdviceAdapter {

    static final String PROPERTY = "hospitalId";

    private final HospitalAccessGuard guard;

    @Override
    public boolean supports(MethodParameter methodParameter, Type targetType,
                            Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object afterBodyRead(Object body, HttpInputMessage inputMessage, MethodParameter parameter,
                                Type targetType, Class<? extends HttpMessageConverter<?>> converterType) {
        pin(body);
        return body;
    }

    /** Sets the body's hospital to the caller's; refuses a mismatch it cannot overwrite. */
    void pin(Object body) {
        if (body == null || guard.currentUser() == null || guard.currentIsSuperAdmin()) return;
        BeanWrapper bean = PropertyAccessorFactory.forBeanPropertyAccess(body);
        if (!bean.isReadableProperty(PROPERTY) || bean.getPropertyType(PROPERTY) != UUID.class) return;

        UUID own = guard.currentHospitalId();
        if (bean.isWritableProperty(PROPERTY)) {
            bean.setPropertyValue(PROPERTY, own);
        } else if (bean.getPropertyValue(PROPERTY) != null && !own.equals(bean.getPropertyValue(PROPERTY))) {
            throw new AccessDeniedException("Cross-hospital access denied");
        }
    }
}
