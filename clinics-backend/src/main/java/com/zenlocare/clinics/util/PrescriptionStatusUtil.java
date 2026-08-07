package com.zenlocare.clinics.util;

import com.zenlocare.clinics.entity.PrescriptionDispenseStatus;
import com.zenlocare.clinics.entity.PrescriptionItem;

import java.util.List;

public class PrescriptionStatusUtil {

    public static String calculateOverallStatus(List<PrescriptionItem> items) {
        if (items == null || items.isEmpty()) {
            return "PENDING";
        }

        boolean hasDispensed = false;
        boolean hasPending = false;
        boolean hasNotDispensed = false;
        boolean hasPartiallyDispensed = false;

        for (PrescriptionItem item : items) {
            PrescriptionDispenseStatus status = item.getDispenseStatus();
            if (status == PrescriptionDispenseStatus.DISPENSED) {
                hasDispensed = true;
            } else if (status == PrescriptionDispenseStatus.PENDING) {
                hasPending = true;
            } else if (status == PrescriptionDispenseStatus.NOT_DISPENSED) {
                hasNotDispensed = true;
            } else if (status == PrescriptionDispenseStatus.PARTIALLY_DISPENSED) {
                hasPartiallyDispensed = true;
            }
        }

        if (hasPartiallyDispensed) {
            return "PARTIALLY_DISPENSED";
        }

        if (hasDispensed && !hasPending && !hasNotDispensed) {
            return "FULLY_DISPENSED";
        }

        if (hasNotDispensed && !hasDispensed && !hasPending) {
            return "NOT_SOLD";
        }

        if (hasDispensed && (hasNotDispensed || hasPending)) {
            return "PARTIALLY_DISPENSED";
        }

        return "PENDING";
    }
}
