package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.dto.InvoiceDTO;
import com.zenlocare.clinics.entity.Invoice;
import com.zenlocare.clinics.service.InvoiceService;
import com.zenlocare.clinics.dto.InvoiceRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/invoices")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class InvoiceController {

    private final InvoiceService invoiceService;

    @PostMapping
    public ResponseEntity<Invoice> createInvoice(@RequestBody com.zenlocare.clinics.dto.InvoiceRequest request) {
        return ResponseEntity.ok(invoiceService.createInvoice(request));
    }

    @GetMapping("/hospital/{hospitalId}")
    public ResponseEntity<List<InvoiceDTO>> getHospitalInvoices(@PathVariable UUID hospitalId) {
        return ResponseEntity.ok(invoiceService.getHospitalInvoices(hospitalId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Invoice> getInvoice(@PathVariable UUID id) {
        try {
            return ResponseEntity.ok(invoiceService.getInvoice(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/opd/paginated")
    public ResponseEntity<Map<String, Object>> getPaginatedOpd(
        @RequestParam UUID hospitalId,
        @RequestParam(defaultValue = "0")   int page,
        @RequestParam(defaultValue = "10")  int size,
        @RequestParam(defaultValue = "ALL") String status,
        @RequestParam(defaultValue = "")    String search
    ) {
        return ResponseEntity.ok(
            invoiceService.getPaginatedOpdInvoices(hospitalId, page, size, status, search)
        );
    }

    @GetMapping("/ipd/paginated")
    public ResponseEntity<Map<String, Object>> getPaginatedIpd(
        @RequestParam UUID hospitalId,
        @RequestParam(defaultValue = "0")    int page,
        @RequestParam(defaultValue = "10")   int size,
        @RequestParam(defaultValue = "ALL")  String status,
        @RequestParam(defaultValue = "")     String search
    ) {
        return ResponseEntity.ok(
            invoiceService.getPaginatedIpdInvoices(hospitalId, page, size, status, search)
        );
    }

    @GetMapping("/appointment/{appointmentId}")
    public ResponseEntity<InvoiceDTO> getInvoiceByAppointment(@PathVariable UUID appointmentId) {
        return invoiceService.getInvoiceByAppointment(appointmentId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
