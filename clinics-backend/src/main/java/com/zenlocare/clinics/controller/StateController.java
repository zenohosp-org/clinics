package com.zenlocare.clinics.controller;

import com.zenlocare.clinics.entity.State;
import com.zenlocare.clinics.repository.StateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/states")
@RequiredArgsConstructor
public class StateController {

    private final StateRepository stateRepository;

    @GetMapping
    public ResponseEntity<List<State>> getStates() {
        return ResponseEntity.ok(stateRepository.findByIsActiveTrueOrderByDisplayOrderAsc());
    }
}
