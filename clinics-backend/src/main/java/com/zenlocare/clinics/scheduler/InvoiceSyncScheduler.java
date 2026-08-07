package com.zenlocare.clinics.scheduler;

import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.repository.InvoiceRepository;
import com.zenlocare.clinics.service.InvoiceService;
import com.zenlocare.clinics.service.SmartBillingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

@Component
public class InvoiceSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(InvoiceSyncScheduler.class);

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private InvoiceService invoiceService;

    @Autowired
    private SmartBillingService smartBillingService;

    /**
     * Runs every 30 minutes.
     * Finds all unpaid/unsettled IPD invoices with a ₹0 or null total
     * and recalculates their estimated totals using SmartBillingService.
     */
    @Scheduled(fixedRate = 1800000)   // 1800000ms = 30 minutes
    public void syncIpdEstimates() {

        log.info("[InvoiceSyncScheduler] Starting IPD estimate sync...");

        try {
            // Fetch all ₹0 or null unpaid/unsettled IPD invoices across all hospitals
            List<Invoice> zeroPendingInvoices = invoiceRepository.findZeroPendingIpdInvoices();

            if (zeroPendingInvoices.isEmpty()) {
                log.info("[InvoiceSyncScheduler] No pending ₹0 IPD invoices found. Skipping.");
                return;
            }

            log.info("[InvoiceSyncScheduler] Found {} invoices to sync.", zeroPendingInvoices.size());

            int updated = 0;
            int skipped = 0;

            for (Invoice invoice : zeroPendingInvoices) {
                try {
                    // Use existing SmartBillingService to compute the estimate
                    BigDecimal estimatedTotal = smartBillingService.computeEstimatedTotal(
                            invoice.getPatient().getId(), 
                            invoice.getAdmission().getId()
                    );

                    if (estimatedTotal != null && estimatedTotal.compareTo(BigDecimal.ZERO) > 0) {
                        // Use existing updateEstimatedTotal — already handles PAID/SETTLED guards
                        invoiceService.updateEstimatedTotal(invoice.getId(), estimatedTotal);
                        updated++;
                    } else {
                        skipped++;
                    }

                } catch (Exception e) {
                    // Log and continue — one failed invoice must not stop the rest
                    log.warn("[InvoiceSyncScheduler] Failed to sync invoice {}: {}",
                        invoice.getId(), e.getMessage());
                    skipped++;
                }
            }

            log.info("[InvoiceSyncScheduler] Sync complete. Updated: {}, Skipped: {}", updated, skipped);

        } catch (Exception e) {
            log.error("[InvoiceSyncScheduler] Sync job failed entirely: {}", e.getMessage());
        }
    }
}
