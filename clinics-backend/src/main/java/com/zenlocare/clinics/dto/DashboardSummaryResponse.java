package com.zenlocare.clinics.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardSummaryResponse {
    // KPI Cards
    private long totalPatients;
    private long todaysNewPatients;
    private double patientMoMGrowthPercent;
    private long totalDoctors;
    private long totalActiveStaff;
    private double totalRevenueCollected;
    private double totalOutstandingRevenue;
    private long activeAdmissions;

    // Charts
    private List<DailyCountDto> patientRegistrationsTrend;
    private List<MonthlyRevenueDto> revenueOverview;
    private List<StatusCountDto> appointmentsBreakdown;
    private List<StatusCountDto> patientAgeGroups;
    private List<StatusCountDto> staffByRole;
}
