import { useState, useEffect } from "react";
import api, { roomTypeApi } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { Button, FormGroup, Input, Modal } from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

/**
 * Bulk room generator — creates N rooms with the same prefix + type +
 * price. Phase 9 migration: data layer untouched (roomTypeApi.getAll
 * to populate the type dropdown, api.post('/rooms/generate') to create).
 */
function GenerateRoomsModal({ onClose, onSuccess }) {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [loading, setLoading] = useState(false);
    const [roomTypes, setRoomTypes] = useState([]);
    const [formData, setFormData] = useState({
        roomPrefix: "GEN",
        roomType: "GENERAL",
        count: 5,
        pricePerDay: 0,
    });

    useEffect(() => {
        roomTypeApi
            .getAll(user.hospitalId)
            .then((data) => {
                if (data?.length) setRoomTypes(data);
            })
            .catch(() => { });
    }, [user.hospitalId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            await api.post("/rooms/generate", {
                ...formData,
                hospitalId: user?.hospitalId,
            });
            onSuccess();
        } catch (error) {
            notify(error.response?.data?.message || "Failed to generate rooms", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Generate rooms"
            size="md"
            footer={
                <>
                    <Button variant="cancel" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        type="submit"
                        form="generate-rooms-form"
                        loading={loading}
                    >
                        Generate
                    </Button>
                </>
            }
        >
            <form
                id="generate-rooms-form"
                onSubmit={handleSubmit}
                className="hms-rooms-form"
            >
                <FormGroup
                    label="Room prefix"
                    hint={`Rooms will be generated as ${formData.roomPrefix}-01, ${formData.roomPrefix}-02, etc.`}
                >
                    <Input
                        required
                        placeholder="e.g. GEN, ICU, WARD"
                        value={formData.roomPrefix}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                roomPrefix: e.target.value.toUpperCase(),
                            })
                        }
                    />
                </FormGroup>

                <FormGroup label="Room type">
                    <SearchableSelect
                        required
                        value={formData.roomType}
                        onChange={(value) => setFormData({ ...formData, roomType: value })}
                        options={
                            roomTypes.length > 0
                                ? roomTypes.map((rt) => ({ value: rt.code, label: rt.label }))
                                : [
                                    { value: "GENERAL", label: "General" },
                                    { value: "ICU", label: "ICU" },
                                    { value: "PRIVATE", label: "Private" },
                                    { value: "OT", label: "OT (Operating Theatre)" },
                                ]
                        }
                    />
                </FormGroup>

                <FormGroup label="Number of rooms to generate">
                    <Input
                        type="number"
                        required
                        min="1"
                        max="50"
                        value={formData.count || ""}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                count: parseInt(e.target.value) || 1,
                            })
                        }
                    />
                </FormGroup>

                <FormGroup
                    label="Price per day (₹)"
                    hint="Used when adding room charges to a bill."
                >
                    <Input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={formData.pricePerDay || ""}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                pricePerDay: parseFloat(e.target.value) || 0,
                            })
                        }
                    />
                </FormGroup>
            </form>
        </Modal>
    );
}

export default GenerateRoomsModal;
