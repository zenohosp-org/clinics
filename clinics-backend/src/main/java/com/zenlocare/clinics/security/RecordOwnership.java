package com.zenlocare.clinics.security;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.PropertyAccessorFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Answers "does the record with this id belong to the caller's hospital?".
 *
 * Every hospital shares one database, so an endpoint that loads a record by
 * its id without asking this hands one hospital's patients to another. A
 * record in another hospital is reported exactly like a missing one, so ids
 * can't be probed across hospitals. A super admin passes.
 */
@Component
@RequiredArgsConstructor
public class RecordOwnership {

    /** Relations walked to reach a hospital when the record carries none itself. */
    private static final List<String> PARENTS = List.of(
            "invoice", "priceList", "doctor", "record", "admission", "appointment", "patient", "booking", "room");
    private static final int MAX_DEPTH = 3;

    private final HospitalAccessGuard guard;
    private final EntityManager entityManager;

    @Transactional(readOnly = true)
    public void require(Class<?> entity, Object id) {
        if (id == null || guard.currentIsSuperAdmin()) return;
        Object row = entityManager.find(entity, id);
        guard.requireOwns(row == null ? null : hospitalOf(row, 0), label(entity));
    }

    static UUID hospitalOf(Object row, int depth) {
        if (row == null || depth > MAX_DEPTH) return null;
        BeanWrapper bean = PropertyAccessorFactory.forBeanPropertyAccess(row);
        if (bean.isReadableProperty("hospitalId") && bean.getPropertyValue("hospitalId") instanceof UUID id) {
            return id;
        }
        if (bean.isReadableProperty("hospital") && bean.getPropertyValue("hospital") != null) {
            Object hospital = bean.getPropertyValue("hospital");
            BeanWrapper h = PropertyAccessorFactory.forBeanPropertyAccess(hospital);
            return h.isReadableProperty("id") && h.getPropertyValue("id") instanceof UUID id ? id : null;
        }
        for (String parent : PARENTS) {
            if (bean.isReadableProperty(parent) && bean.getPropertyValue(parent) != null) {
                UUID found = hospitalOf(bean.getPropertyValue(parent), depth + 1);
                if (found != null) return found;
            }
        }
        return null;
    }

    private static String label(Class<?> entity) {
        return entity.getSimpleName().replaceAll("([a-z])([A-Z])", "$1 $2");
    }
}
