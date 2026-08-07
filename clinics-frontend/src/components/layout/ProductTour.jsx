import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export const startProductTour = () => {
    // Force open settings accordion so Infrastructure is visible
    const settingsBtn = document.getElementById('tour-settings-accordion');
    if (settingsBtn && !settingsBtn.classList.contains('active')) {
        settingsBtn.click();
    }
    
    // Wait for the accordion to open and elements to render
    setTimeout(() => {
        const steps = [
            {
                element: '.zu-topnav-title',
                popover: {
                    title: 'Welcome to ZenoHosp',
                    description: "Welcome to the Clinic Management System! Let's take a quick look around.",
                    side: "bottom",
                    align: 'start'
                }
            }
        ];

        const addSidebarStep = (tourId, title, description) => {
            if (document.querySelector(`[data-tour="${tourId}"]`)) {
                steps.push({
                    element: `[data-tour="${tourId}"]`,
                    popover: {
                        title,
                        description,
                        side: "right",
                        align: 'start'
                    },
                    onHighlightStarted: () => {
                        const el = document.querySelector(`[data-tour="${tourId}"]`);
                        if (el) {
                            el.scrollIntoView({ block: 'center', behavior: 'instant' });
                        }
                    }
                });
            }
        };

        addSidebarStep("doctors", "Doctors Directory", "Manage your medical staff, their profiles, and availability schedules here.");
        
        // Fallback to patients if doctors is not available
        if (!document.querySelector('[data-tour="doctors"]')) {
            addSidebarStep("patients", "Patients Directory", "Manage your patients here.");
        }

        addSidebarStep("specializations", "Specializations", "Define and manage the medical specializations offered by your hospital.");
        addSidebarStep("services", "Services", "Configure both hospital services and patient services offered.");
        addSidebarStep("infrastructure", "Infrastructure", "Manage your hospital buildings, floors, wards, and rooms.");

        steps.push({
            element: '#tour-notification-bell',
            popover: {
                title: 'Notifications',
                description: 'Important alerts and patient notifications will appear here.',
                side: "bottom",
                align: 'end'
            }
        });

        steps.push({
            element: '.zu-topnav-user',
            popover: {
                title: 'Profile & Settings',
                description: 'Manage your profile, preferences, and sign out from here.',
                side: "bottom",
                align: 'end'
            }
        });

        const driverObj = driver({
            showProgress: true,
            allowClose: true,
            popoverClass: 'zu-driver-popover',
            onDestroyed: () => {
                localStorage.setItem("hms_tour_completed", "true");
            },
            steps: steps
        });

        driverObj.drive();
    }, 300);
};

export default function ProductTour() {
    useEffect(() => {
        // Small delay to ensure the DOM is fully painted
        const timer = setTimeout(() => {
            const isCompleted = localStorage.getItem("hms_tour_completed");
            if (isCompleted === "true") return;
            startProductTour();
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    return null;
}
