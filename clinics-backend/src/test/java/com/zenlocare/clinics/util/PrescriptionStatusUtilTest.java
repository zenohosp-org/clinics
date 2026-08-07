package com.zenlocare.clinics.util;

import com.zenlocare.clinics.entity.PrescriptionDispenseStatus;
import com.zenlocare.clinics.entity.PrescriptionItem;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Arrays;
import java.util.List;

public class PrescriptionStatusUtilTest {

    @Test
    public void testCalculateOverallStatus() {
        // Test [DISPENSED, DISPENSED, NOT_DISPENSED] -> PARTIALLY_DISPENSED
        List<PrescriptionItem> items1 = Arrays.asList(
                createItem(PrescriptionDispenseStatus.DISPENSED),
                createItem(PrescriptionDispenseStatus.DISPENSED),
                createItem(PrescriptionDispenseStatus.NOT_DISPENSED)
        );
        assertEquals("PARTIALLY_DISPENSED", PrescriptionStatusUtil.calculateOverallStatus(items1));

        // Test all DISPENSED
        List<PrescriptionItem> items2 = Arrays.asList(
                createItem(PrescriptionDispenseStatus.DISPENSED),
                createItem(PrescriptionDispenseStatus.DISPENSED)
        );
        assertEquals("FULLY_DISPENSED", PrescriptionStatusUtil.calculateOverallStatus(items2));

        // Test all NOT_DISPENSED
        List<PrescriptionItem> items3 = Arrays.asList(
                createItem(PrescriptionDispenseStatus.NOT_DISPENSED),
                createItem(PrescriptionDispenseStatus.NOT_DISPENSED)
        );
        assertEquals("NOT_SOLD", PrescriptionStatusUtil.calculateOverallStatus(items3));

        // Test all PENDING
        List<PrescriptionItem> items4 = Arrays.asList(
                createItem(PrescriptionDispenseStatus.PENDING),
                createItem(PrescriptionDispenseStatus.PENDING)
        );
        assertEquals("PENDING", PrescriptionStatusUtil.calculateOverallStatus(items4));

        // Test mixed PENDING and NOT_DISPENSED (patient hasn't decided on one, declined other)
        List<PrescriptionItem> items5 = Arrays.asList(
                createItem(PrescriptionDispenseStatus.PENDING),
                createItem(PrescriptionDispenseStatus.NOT_DISPENSED)
        );
        assertEquals("PENDING", PrescriptionStatusUtil.calculateOverallStatus(items5));
    }

    private PrescriptionItem createItem(PrescriptionDispenseStatus status) {
        PrescriptionItem item = new PrescriptionItem();
        item.setDispenseStatus(status);
        return item;
    }
}
