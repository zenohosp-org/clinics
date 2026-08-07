import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './CheckInWidget.css';

const DIRECTORY_API_URL = import.meta.env?.VITE_DIRECTORY_API_URL || 'https://api-directory.zenohosp.com';
const getAttendanceStatus = () =>
    axios.get(`${DIRECTORY_API_URL}/api/attendance/status`, { withCredentials: true });

// Same-day snapshot cache so a page refresh resumes the timer instantly from
// the last-known state instead of flashing empty. The snapshot carries the
// time it was taken, so the counter continues from exactly where it left off.
const CACHE_KEY = 'zeno_attendance_status_v1';
function readCache() {
    try {
        const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (!raw?.cachedAt || new Date(raw.cachedAt).toDateString() !== new Date().toDateString()) return null;
        return raw;
    } catch { return null; }
}
function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: Date.now() })); } catch { /* best-effort */ }
}

const LaptopIcon = ({ className }) => (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M2 20h20" />
    </svg>
);

/**
 * Suite-wide attendance display (top bar) — read-only.
 *
 * Attendance has one writer: the biometric device, ingested by the People/HR
 * app and mirrored onto Directory server-side. Every app just reads and shows
 * the shared state, so a member's checked-in status and today's total look the
 * same wherever they are. Hidden entirely where the hospital hasn't bought the
 * People module (attendanceEnabled=false) or Directory is unreachable, rather
 * than showing a broken-looking permanent 00:00:00.
 */
export default function CheckInWidget() {
    const [status, setStatus] = useState(readCache);
    const [now, setNow] = useState(() => Date.now());
    const [fetchedAt, setFetchedAt] = useState(() => readCache()?.cachedAt ?? 0);

    const refresh = useCallback(() => {
        getAttendanceStatus()
            .then((res) => {
                const data = res.data?.data ?? res.data;
                const t = Date.now();
                setFetchedAt(t);
                setNow(t);
                setStatus(data);
                writeCache(data);
            })
            .catch(() => setStatus(null)); // Directory unreachable — hide, never block the app
    }, []);

    useEffect(() => {
        refresh();
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [refresh]);

    useEffect(() => {
        if (!status?.checkedIn) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [status?.checkedIn]);

    if (status === null) return null;
    if (status.attendanceEnabled === false) return null;

    const baseSeconds = status.todaySeconds ?? (status.todayMinutes ?? 0) * 60;
    const liveSeconds = status.checkedIn
        ? baseSeconds + Math.max(0, Math.floor((now - fetchedAt) / 1000))
        : baseSeconds;
    const hh = String(Math.floor(liveSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((liveSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(liveSeconds % 60).padStart(2, '0');
    const elapsed = `${hh}:${mm}:${ss}`;
    const state = status.checkedIn ? 'Checked in' : liveSeconds > 0 ? 'Checked out' : 'Not checked in';
    const tooltip = `${state} — ${elapsed} today. Recorded by the biometric device.`;

    return (
        <div className="checkin-widget is-topbar" title={tooltip}>
            <LaptopIcon className={`checkin-icon${status.checkedIn ? ' is-in' : ''}`} />
            <span className="checkin-label">{elapsed} · {state}</span>
        </div>
    );
}
