package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DailyCountDto {
    private String date; // formatted date, e.g., "May 18"
    private long count;
}
