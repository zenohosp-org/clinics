import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { appointmentsApi, doctorsApi, type DoctorUser, type Appointment } from '@/utils/api'
import { useNotification } from '@/context/NotificationContext'
import { useAuth } from '@/context/AuthContext'
import DoctorFormModal from '@/components/modals/DoctorFormModal'
import { Plus, Search, Edit2, Trash2, Shield, AlertCircle, Loader2, Hospital, Banknote, CalendarIcon, ChevronLeft, MapPin, Building2, Clock, Mail, Phone, BookOpen, Stethoscope, User, CheckCircle } from 'lucide-react'

export default function DoctorDetails() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { notify } = useNotification()
    const { user } = useAuth()

    const [doctor, setDoctor] = useState<DoctorUser | null>(null)
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState(false)
    const [tab, setTab] = useState<'overview' | 'appointments' | 'patients'>('overview')
    
    // States for tab data
    const [doctorAppointments, setDoctorAppointments] = useState<Appointment[]>([])
    const [loadingAppointments, setLoadingAppointments] = useState(false)

    // Derived unique patients list
    const doctorPatients = React.useMemo(() => {
        const pMap = new Map<number, { id: number, name: string, visits: number, lastVisit: string }>()
        doctorAppointments.forEach(appt => {
            if (!pMap.has(appt.patientId)) {
                pMap.set(appt.patientId, { id: appt.patientId, name: appt.patientName, visits: 1, lastVisit: appt.apptDate.substring(0, 10) })
            } else {
                const existing = pMap.get(appt.patientId)!
                existing.visits += 1
                if (appt.apptDate > existing.lastVisit) {
                    existing.lastVisit = appt.apptDate.substring(0, 10)
                }
                pMap.set(appt.patientId, existing)
            }
        })
        return Array.from(pMap.values()).sort((a, b) => b.lastVisit.localeCompare(a.lastVisit))
    }, [doctorAppointments])

    const loadData = async () => {
        if (!id) return
        try {
            setLoading(true)
            const docData = await doctorsApi.get(id)
            setDoctor(docData)
            
            // Fetch appointments associated with this doctor
            setLoadingAppointments(true)
            try {
                // To get all appointments past and future, we could skip passing 'date' if the API allows returning all,
                // but since the endpoint returns all if date isn't provided (as seen in utils/api.ts for getByHospital), 
                // we'll use a hospital fetch filtered by doctorId.
                const hospitalId = docData.hospitalId
                const appts = await appointmentsApi.getByHospital(hospitalId)
                const docAppts = appts.filter((a) => a.doctorId === docData.id)
                // Sort by date/time desc (newest first)
                docAppts.sort((a, b) => new Date(`${b.apptDate}T${b.apptTime}`).getTime() - new Date(`${a.apptDate}T${a.apptTime}`).getTime())
                setDoctorAppointments(docAppts)
            } catch (err) {
                console.error("Failed to load appointments", err)
            } finally {
                setLoadingAppointments(false)
            }

        } catch (error) {
            notify('Failed to load doctor details', 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadData() }, [id])

    if (loading) return (
        <div className="flex items-center justify-center h-screen bg-white dark:bg-[#0f0f0f]">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    )

    if (!doctor) return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 bg-white dark:bg-[#0f0f0f]">
            <p className="text-slate-500">Doctor not found.</p>
            <button onClick={() => navigate(-1)} className="btn-secondary">Go Back</button>
        </div>
    )

    const canEdit = user?.role === 'HOSPITAL_ADMIN' || user?.userId === doctor.userId
    const initials = `${doctor.firstName[0]}${doctor.lastName?.[0] ?? ''}`.toUpperCase()

    return (
        <div className="flex gap-0 h-[calc(100vh-3.5rem)] w-[calc(100%+3rem)] -mx-6 -mt-6 overflow-hidden bg-white dark:bg-[#0f0f0f]">
            {/* ━━━━━━━━━━━━━━━  LEFT PANE — Doctor Profile  ━━━━━━━━━━━━━━━ */}
            <aside className="w-72 shrink-0 flex flex-col bg-white dark:bg-[#111111] border-r border-slate-200 dark:border-[#1e1e1e] overflow-y-auto">
                {/* Back & Actions */}
                <div className="px-5 pt-5 pb-3 border-b border-slate-200 dark:border-[#1e1e1e] flex justify-between items-center relative">
                    <button
                        onClick={() => navigate('/doctors')}
                        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#666666] hover:text-slate-800 dark:hover:text-[#cccccc] transition-colors"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" /> Back to Doctors
                    </button>
                {canEdit && (
                    <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1e1e1e] rounded-xl text-sm font-bold text-slate-700 dark:text-[#cccccc] hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Edit2 className="w-4 h-4" /> Edit Profile
                    </button>
                )}
            </div>

                {/* Avatar + Name block */}
                <div className="px-5 py-6 text-center border-b border-slate-200 dark:border-[#1e1e1e]">
                    <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-500/10 border border-slate-200 dark:border-[#2a2a2a] mx-auto mb-3
                        flex items-center justify-center text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {initials}
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                        Dr. {doctor.firstName} {doctor.lastName}
                    </h2>
                    <p className="text-sm font-semibold text-slate-500 dark:text-[#666666] mt-1 uppercase tracking-wider">
                        {doctor.specialization || 'General Practitioner'}
                    </p>

                    <div className="flex items-center justify-center gap-2 mt-3">
                        {doctor.userIsActive ? (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-100 dark:border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-full border border-red-100 dark:border-red-500/20 text-[10px] font-bold uppercase tracking-wider">
                                Inactive
                            </div>
                        )}
                    </div>
                </div>

                {/* Sections */}
                <div className="px-5 py-5 space-y-6 flex-1">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <User className="w-4 h-4 text-[#666666]" />
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-[#cccccc] uppercase tracking-wide">Contact Info</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <Mail className="w-4 h-4 mt-0.5 shrink-0 text-[#555] dark:text-[#555555]" />
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-[#555555] font-semibold">Email</p>
                                    <p className="text-sm text-slate-700 dark:text-[#cccccc] mt-0.5 break-all">{doctor.email}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <Phone className="w-4 h-4 mt-0.5 shrink-0 text-[#555] dark:text-[#555555]" />
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-[#555555] font-semibold">Phone</p>
                                    <p className="text-sm text-slate-700 dark:text-[#cccccc] mt-0.5">{doctor.phone || '—'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-[#555] dark:text-[#555555]" />
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-                                    <p className="text-sm text-slate-700 dark:text-[#cccccc] mt-0.5 leading-relaxed">
                                        {doctor.qualification || 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* ━━━━━━━━━━━━━━━  RIGHT PANE — Details  ━━━━━━━━━━━━━━━ */}
