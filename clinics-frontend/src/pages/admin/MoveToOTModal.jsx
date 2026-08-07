import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { admissionApi, roomApi, doctorsApi } from "@/utils/api";
import { Scissors, BedDouble, Stethoscope } from "lucide-react";
import {
    Button,
    FormGroup,
    Modal,
} from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

/**
 * Move-to-OT modal. Lists OT rooms with status AVAILABLE and the
 * active doctor roster. Caller (Admissions list) owns the admission;
 * onMoved() runs after a successful admissionApi.moveToOT call. Room
 * radio list lives in admin.css under .hms-room-radio* — it's also
 * reusable by other "select room from a short list" modals.
 */
export default function MoveToOTModal({ admission, onClose, onMoved }) {
    const { user } = useAuth();
    const { notify } = useNotification();

    const [otRooms, setOtRooms] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState("");
    const [selectedDoctorId, setSelectedDoctorId] = useState(
        admission.admittingDoctorId || ""
    );

    useEffect(() => {
        if (!user?.hospitalId) return;
        Promise.all([roomApi.list(user.hospitalId), doctorsApi.list(user.hospitalId)])
            .then(([rooms, docs]) => {
                setOtRooms(
                    rooms.filter((r) => r.roomCategory === "OT" && r.status === "AVAILABLE")
                );
                setDoctors(docs.filter((d) => d.userIsActive));
            })
            .catch(() => {
                notify("Failed to load OT rooms or doctors", "error");
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    const handleSubmit = async () => {
        if (!selectedRoomId) {
            notify("Please select an OT room", "warning");
            return;
        }
        setSubmitting(true);
        try {
            await admissionApi.moveToOT(
                admission.id,
                Number(selectedRoomId),
                selectedDoctorId || null
            );
            notify(`${admission.patientName} moved to OT successfully`, "success");
            onMoved();
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to move patient to OT", "error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="md"
            title={
                <div className="hms-modal-title-row">
                    <span className="hms-icon-tile">
                        <Scissors size={16} />
                    </span>
                    <div className="hms-modal-title-row__body">
                        <p className="hms-modal-title-row__title">Move to OT</p>
                        <p className="hms-modal-title-row__subtitle">{admission.patientName}</p>
                    </div>
                </div>
            }
            footer={
                <>
                    <Button variant="cancel" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={loading || !selectedRoomId}
                        loading={submitting}
                    >
                        Move to OT
                    </Button>
                </>
            }
        >
            {loading ? (
                <CenterLoader text="Loading OT rooms…" />
            ) : (
                <div className="flex flex-col gap-5">
                    <FormGroup
                        label={
                            <span className="inline-flex items-center gap-1.5">
                                <BedDouble size={14} /> Select OT room
                            </span>
                        }
                    >
                        {otRooms.length === 0 ? (
                            <div className="hms-room-empty">
                                No OT rooms available. Add OT rooms in Settings → Infrastructure.
                            </div>
                        ) : (
                            <div className="hms-room-radio-list">
                                {otRooms.map((room) => {
                                    const selected = selectedRoomId === String(room.id);
                                    return (
                                        <label
                                            key={room.id}
                                            className={`hms-room-radio ${selected ? "is-on" : ""}`}
                                        >
                                            <input
                                                type="radio"
                                                name="otRoom"
                                                value={room.id}
                                                checked={selected}
                                                onChange={(e) => setSelectedRoomId(e.target.value)}
                                                className="hms-room-radio__input"
                                            />
                                            <div>
                                                <p className="hms-room-radio__name">
                                                    {room.roomNumber}
                                                </p>
                                                <p className="hms-room-radio__sub">
                                                    OT · Available
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </FormGroup>

                    <FormGroup
                        label={
                            <span className="inline-flex items-center gap-1.5">
                                <Stethoscope size={14} /> Performing doctor
                            </span>
                        }
                    >
                        <SearchableSelect
                            value={selectedDoctorId}
                            onChange={(v) => setSelectedDoctorId(v)}
                            options={doctors.map((d) => ({
                                value: d.id,
                                label: `Dr. ${d.firstName} ${d.lastName}${d.specialization ? ` · ${d.specialization}` : ""
                                    }`,
                            }))}
                            placeholder="— Keep current doctor —"
                        />
                    </FormGroup>
                </div>
            )}
        </Modal>
    );
}
