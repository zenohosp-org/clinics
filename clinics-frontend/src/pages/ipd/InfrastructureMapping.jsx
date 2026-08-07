import { CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useBlocker } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { infrastructureApi, roomTypeApi } from "@/utils/api";
import { Modal, Button, FormGroup, Input, Select } from "@/components/ui";
import {
  Building2,
  Layers,
  Minus,
  Plus,
  Save,
  AlertTriangle,
  Network,
  Bed,
  BedDouble,
  BedSingle,
  Crown,
  Scissors,
  HeartPulse,
  Heart,
  Baby,
  Shield,
  Siren,
  Activity,
  X,
  Trash2,
  RefreshCcw,
  Package,
  Search,
  Edit2,
  Info,
  Pill,
  FlaskConical,
  Droplets,
  User,
  ClipboardPlus,
  Users
} from "lucide-react";

// Fallback room types used while API loads
const FALLBACK_ROOM_TYPES = [
  { value: "GENERAL", label: "General Ward", category: "WARD", hasBeds: true, hasDailyCharge: true },
  { value: "ICU", label: "ICU", category: "WARD", hasBeds: true, hasDailyCharge: true },
  { value: "PRIVATE", label: "Private Room", category: "ROOM", hasBeds: true, hasDailyCharge: true },
  { value: "SEMI_PRIVATE", label: "Semi-Private Room", category: "ROOM", hasBeds: true, hasDailyCharge: true },
  { value: "OT", label: "Operating Theatre", category: "OT", hasBeds: false, hasDailyCharge: false },
  { value: "CATH_LAB", label: "Cath Lab", category: "OT", hasBeds: false, hasDailyCharge: false },
  { value: "STORE", label: "Inventory Store", category: "STORE", hasBeds: false, hasDailyCharge: false },
];

// Duplicate names are allowed (we only warn), so we just need the repeated keys
function findDuplicateNames(names) {
  const counts = new Map();
  (names || []).forEach((n) => {
    const key = (n || "").trim().toLowerCase();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set([...counts].filter(([, c]) => c > 1).map(([key]) => key));
}

function resizeTo(arr, n, makeDefault) {
  if (n <= 0) return [];
  if (n > arr.length) return [...arr, ...Array(n - arr.length).fill(null).map((_, i) => makeDefault(arr.length + i))];
  return arr.slice(0, n);
}

function Stepper({ value, onChange, min = 0, max = 50, variant = "default" }) {
  const dark = variant === "dark";
  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={dark ? "hms-infra-stepper__btn is-dark" : "hms-infra-stepper__btn"}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className={dark ? "hms-infra-stepper__num is-dark" : "hms-infra-stepper__num"}>{value}</span>
      <button
        type="button"
        className={dark ? "hms-infra-stepper__btn is-dark" : "hms-infra-stepper__btn"}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function InfrastructureMapping() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const [buildings, _setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState(FALLBACK_ROOM_TYPES);
  const [isDirty, setIsDirty] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const setBuildings = (val) => {
    setIsDirty(true);
    _setBuildings(val);
  };

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Search & Navigation States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeBuildingIdx, setActiveBuildingIdx] = useState(0);
  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  const [activeWardIdx, setActiveWardIdx] = useState(0);
  const [activeRoomIdx, setActiveRoomIdx] = useState(0);

  const supportsBeds = useCallback((typeValue) => {
    if (!typeValue) return true;
    const t = roomTypes.find(rt => rt.value === typeValue);
    if (!t) return true;
    return t.hasBeds;
  }, [roomTypes]);

  // Modals state
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    message: "",
    onConfirm: null,
    dependencies: [],
  });
  const [confirmText, setConfirmText] = useState("");
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);
  const [addZoneRoomModal, setAddZoneRoomModal] = useState({ 
    isOpen: false, target: 'floor', bIdx: null, fIdx: null, wIdx: null, selectedType: "ward", name: "", roomType: "GENERAL", dailyCharge: "", bedCount: 1 
  });
  const [editModal, setEditModal] = useState({
    show: false,
    type: null, // "building" | "floor" | "ward" | "room" | "ward-room" | "bed"
    bIdx: null,
    fIdx: null,
    wIdx: null,
    rIdx: null,
    bItemIdx: null,
    formState: {} // Temp state for editing
  });

  useEffect(() => {
    // Load dynamic room types
    roomTypeApi.getAll(user.hospitalId)
      .then((data) => {
        if (data?.length) {
          setRoomTypes(
            Array.from(new Map(data.map(t => [t.code, t])).values()).map(t => ({
              value: t.code,
              label: t.label,
              category: t.category,
              color: t.color,
              icon: t.icon,
              hasBeds: t.hasBeds ?? true,
              hasDailyCharge: t.hasDailyCharge ?? true,
              isSystem: t.isSystem
            }))
          );
        }
      })
      .catch(() => { });

    infrastructureApi.get(user.hospitalId, showInactive)
      .then((data) => {
        if (data?.length) {
          _setBuildings(data.map((b) => ({
            id: b.id,
            name: b.name,
            isActive: b.isActive,
            floors: (b.floors ?? []).map((f) => {
              const allWards = f.wards ?? [];
              return {
                id: f.id,
                name: f.name,
                isActive: f.isActive,
                wards: allWards.map(w => {
                  const isStandaloneRoom = w.rooms?.length === 1 && w.rooms[0].name === w.name;
                  return {
                    id: w.id,
                    name: w.name,
                    isActive: w.isActive,
                    nodeType: isStandaloneRoom ? "room" : "ward",
                    roomType: w.roomType ?? "GENERAL",
                    dailyCharge: w.dailyCharge ?? "",
                    bedNames: w.bedNames ?? [],
                    beds: w.beds ?? [],
                    rooms: (w.rooms ?? []).map((r) => ({
                      id: r.id,
                      name: r.name,
                      isActive: r.isActive,
                      bedNames: r.bedNames ?? [],
                      beds: r.beds ?? [],
                    })),
                  };
                }),
              };
            }),
          })));
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [user.hospitalId, showInactive]);

  const stats = useMemo(() => {
    let bldgs = buildings.length;
    let floors = 0;
    let rooms = 0;
    let ots = 0;
    let stores = 0;
    let beds = 0;

    buildings.forEach(b => {
      floors += (b.floors || []).length;
      (b.floors || []).forEach(f => {
        (f.wards || []).forEach(w => {
          const typeObj = roomTypes.find(t => t.value === w.roomType);
          const category = typeObj ? typeObj.category : null;

          if (category === "OT") ots++;
          else if (category === "STORE") stores++;
          
          if (w.nodeType === "room") {
            rooms++;
            beds += (w.rooms?.[0]?.bedNames || []).length;
          } else {
            rooms += (w.rooms || []).length;
            (w.rooms || []).forEach(r => {
              beds += (r.bedNames || []).length;
            });
            beds += (w.bedNames || []).length;
          }
        });
      });
    });

    return { bldgs, floors, rooms, ots, stores, beds };
  }, [buildings, roomTypes]);

  const supportsDailyCharge = useCallback((typeValue) => {
    if (!typeValue) return true;
    const t = roomTypes.find(rt => rt.value === typeValue);
    if (!t) return true;
    return t.hasDailyCharge;
  }, [roomTypes]);

  // Filtered Tree representation based on query
  const filteredTree = useMemo(() => {
    const formatted = buildings.map((b, bIdx) => ({
      ...b,
      originalIdx: bIdx,
      floors: (b.floors || []).map((f, fIdx) => ({
        ...f,
        originalIdx: fIdx
      }))
    }));

    if (!searchQuery) return formatted;
    const query = searchQuery.toLowerCase();

    return formatted.map((b) => {
      const floors = b.floors.map((f) => {
        const wards = (f.wards || []).filter(w =>
          w.name.toLowerCase().includes(query) ||
          w.roomType.toLowerCase().includes(query) ||
          w.rooms.some(r => r.name.toLowerCase().includes(query))
        );
        return { ...f, wards };
      }).filter(f => f.wards.length > 0 || f.name.toLowerCase().includes(query));

      return { ...b, floors };
    }).filter(b => b.floors.length > 0 || b.name.toLowerCase().includes(query));
  }, [buildings, searchQuery]);

  const confirmReduction = async (message, onConfirm, dependencies = [], roomIds = [], bedIds = []) => {
    if (roomIds.length > 0 || bedIds.length > 0) {
      try {
        const validation = await infrastructureApi.validateRemoval({ roomIds, bedIds });
        setConfirmText("");
        setAcknowledgeWarnings(false);
        setConfirmModal({
          show: true,
          message,
          onConfirm: () => {
            onConfirm();
            setConfirmModal({ show: false, message: "", onConfirm: null, dependencies: [] });
          },
          dependencies,
          validation
        });
      } catch (err) {
        if (err.response?.status === 409) {
          setConfirmText("");
          setAcknowledgeWarnings(false);
          setConfirmModal({
            show: true,
            message,
            onConfirm: () => {
              onConfirm();
              setConfirmModal({ show: false, message: "", onConfirm: null, dependencies: [] });
            },
            dependencies,
            validation: err.response.data
          });
        } else {
          notify("Failed to validate infrastructure removal", "error");
        }
      }
    } else {
      setConfirmText("");
      setAcknowledgeWarnings(false);
      setConfirmModal({
        show: true,
        message,
        onConfirm: () => {
          onConfirm();
          setConfirmModal({ show: false, message: "", onConfirm: null, dependencies: [] });
        },
        dependencies,
        validation: null
      });
    }
  };

  const handleAddBuilding = () => {
    const nextIdx = buildings.length;
    const newB = { name: `Building ${nextIdx + 1}`, floors: [] };
    setBuildings([...buildings, newB]);
    setActiveBuildingIdx(nextIdx);
    setActiveFloorIdx(0);
  };

  const handleAddFloor = (bIdx) => {
    const currentFloors = buildings[bIdx].floors;
    const nextFlr = currentFloors.length;
    setBuildings(p => p.map((b, i) => i !== bIdx ? b : {
      ...b,
      floors: [...b.floors, { name: `Floor ${nextFlr + 1}`, wards: [] }]
    }));
    setActiveFloorIdx(nextFlr);
  };

  const handleAddWardOrRoom = (bIdx, fIdx, type, nameOverride, roomTypeOverride, dailyChargeOverride) => {
    const currentWards = buildings[bIdx].floors[fIdx].wards || [];
    const newIdx = currentWards.length;
    setBuildings(p => p.map((b, i) => i !== bIdx ? b : {
      ...b,
      floors: b.floors.map((f, j) => j !== fIdx ? f : {
        ...f,
        wards: [...f.wards, {
          name: nameOverride || (type === 'ward' ? `Ward ${newIdx + 1}` : `Room ${newIdx + 1}`),
          nodeType: type,
          roomType: roomTypeOverride || (type === 'ward' ? "GENERAL" : "OT"),
          dailyCharge: dailyChargeOverride || "",
          rooms: type === 'room' ? [{ name: nameOverride || `Room ${newIdx + 1}`, bedNames: [] }] : []
        }]
      })
    }));
    setActiveWardIdx(newIdx);
  };

  const handleAddNodeToWard = (bIdx, fIdx, wIdx, type, name, roomType, dailyCharge, bedCount) => {
    const ward = buildings[bIdx].floors[fIdx].wards[wIdx];
    const currentRooms = ward.rooms || [];
    const currentBeds = ward.bedNames || [];
    
    setBuildings(p => p.map((b, i) => i !== bIdx ? b : {
      ...b,
      floors: b.floors.map((f, j) => j !== fIdx ? f : {
        ...f,
        wards: f.wards.map((w, k) => k !== wIdx ? w : {
          ...w,
          rooms: type === 'room' ? [...w.rooms, { name: name || `Room ${currentRooms.length + 1}`, bedNames: [] }] : w.rooms,
          bedNames: type === 'beds' ? [...(w.bedNames || []), ...Array.from({ length: bedCount }).map((_, idx) => `Bed ${currentBeds.length + idx + 1}`)] : (w.bedNames || [])
        })
      })
    }));
  };

  const handleAddBedToRoom = (bIdx, fIdx, wIdx, rIdx) => {
    const room = buildings[bIdx].floors[fIdx].wards[wIdx].rooms[rIdx];
    const currentBeds = room.bedNames || [];
    setBuildings(p => p.map((b, i) => i !== bIdx ? b : {
      ...b,
      floors: b.floors.map((f, j) => j !== fIdx ? f : {
        ...f,
        wards: f.wards.map((w, k) => k !== wIdx ? w : {
          ...w,
          rooms: w.rooms.map((r, l) => l !== rIdx ? r : {
            ...r,
            bedNames: [...(r.bedNames || []), `Bed ${currentBeds.length + 1}`]
          })
        })
      })
    }));
  };

  const deleteBuilding = (bIdx) => {
    const b = buildings[bIdx];
    const executeDelete = () => {
      setBuildings((p) => p.filter((_, i) => i !== bIdx));
      setActiveBuildingIdx((prev) => Math.max(0, prev - 1));
      setActiveFloorIdx(0);
    };

    let floorCount = b.floors.length;
    let wardCount = 0;    let roomCount = 0; let bedCount = 0;
    let roomIds = []; let bedIds = [];
    b.floors.forEach(f => {
      wardCount += (f.wards || []).length;
      (f.wards || []).forEach(w => {
        roomCount += (w.rooms || []).length;
        (w.rooms || []).forEach(r => {
          if (r.id) roomIds.push(r.id);
          bedCount += (r.bedNames || []).length;
          (r.beds || []).forEach(bd => { if (bd.id) bedIds.push(bd.id); });
        });
        (w.beds || []).forEach(bd => { if (bd.id) bedIds.push(bd.id); });
      });
    });

    const deps = [];
    if (floorCount > 0) deps.push(`${floorCount} Floor${floorCount !== 1 ? 's' : ''}`);
    if (wardCount > 0) deps.push(`${wardCount} Ward${wardCount !== 1 ? 's' : ''}`);
    if (roomCount > 0) deps.push(`${roomCount} Room${roomCount !== 1 ? 's' : ''}`);
    if (bedCount > 0) deps.push(`${bedCount} Bed${bedCount !== 1 ? 's' : ''}`);

    confirmReduction(
      `Are you sure you want to delete ${b.name || `Building ${bIdx + 1}`}? This will permanently discard all configured floors, wards, and rooms under it.`,
      executeDelete,
      deps,
      roomIds,
      bedIds
    );
  };

  const deleteFloor = (bIdx, fIdx) => {
    const f = buildings[bIdx].floors[fIdx];
    const executeDelete = () => {
      setBuildings((p) => p.map((b, i) => i !== bIdx ? b : {
        ...b,
        floors: b.floors.filter((_, j) => j !== fIdx)
      }));
      setActiveFloorIdx((prev) => Math.max(0, prev - 1));
    };

    let wardCount = (f.wards || []).length;
    let roomCount = 0; let bedCount = 0;
    let roomIds = []; let bedIds = [];
    (f.wards || []).forEach(w => {
      roomCount += (w.rooms || []).length;
      (w.rooms || []).forEach(r => {
        if (r.id) roomIds.push(r.id);
        bedCount += (r.bedNames || []).length;
        (r.beds || []).forEach(bd => { if (bd.id) bedIds.push(bd.id); });
      });
      (w.beds || []).forEach(bd => { if (bd.id) bedIds.push(bd.id); });
    });

    const deps = [];
    if (wardCount > 0) deps.push(`${wardCount} Ward${wardCount !== 1 ? 's' : ''}`);
    if (roomCount > 0) deps.push(`${roomCount} Room${roomCount !== 1 ? 's' : ''}`);
    if (bedCount > 0) deps.push(`${bedCount} Bed${bedCount !== 1 ? 's' : ''}`);

    confirmReduction(
      `Are you sure you want to delete ${f.name || `Floor ${fIdx + 1}`}? This will permanently discard all configured wards and rooms on it.`,
      executeDelete,
      deps,
      roomIds,
      bedIds
    );
  };

  const removeWard = (bIdx, fIdx, wIdx) => {
    const ward = buildings[bIdx].floors[fIdx].wards[wIdx];
    const executeDelete = () => {
      setBuildings((p) => p.map((b, i) => i !== bIdx ? b : {
        ...b, floors: b.floors.map((f, j) => j !== fIdx ? f : {
          ...f, wards: f.wards.filter((_, k) => k !== wIdx)
        })
      }));
    };

    let roomCount = (ward.rooms || []).length;
    let bedCount = 0;
    let roomIds = []; let bedIds = [];
    (ward.rooms || []).forEach(r => {
      if (r.id) roomIds.push(r.id);
      bedCount += (r.bedNames || []).length;
      (r.beds || []).forEach(bd => { if (bd.id) bedIds.push(bd.id); });
    });
    (ward.beds || []).forEach(bd => { if (bd.id) bedIds.push(bd.id); });

    const deps = [];
    if (roomCount > 0) deps.push(`${roomCount} Room${roomCount !== 1 ? 's' : ''}`);
    if (bedCount > 0) deps.push(`${bedCount} Bed${bedCount !== 1 ? 's' : ''}`);

    confirmReduction(
      `Are you sure you want to delete ${ward.name || `Ward ${wIdx + 1}`}? This will permanently discard all configured rooms in it.`,
      executeDelete,
      deps,
      roomIds,
      bedIds
    );
  };

  const removeRoom = (bIdx, fIdx, wIdx, rIdx) => {
    const room = buildings[bIdx].floors[fIdx].wards[wIdx].rooms[rIdx];
    const executeDelete = () => {
      setBuildings((p) => p.map((b, i) => i !== bIdx ? b : {
        ...b, floors: b.floors.map((f, j) => j !== fIdx ? f : {
          ...f, wards: f.wards.map((w, k) => k !== wIdx ? w : {
            ...w, rooms: w.rooms.filter((_, l) => l !== rIdx)
          })
        })
      }));
    };

    let bedCount = (room.bedNames || []).length;
    let roomIds = room.id ? [room.id] : [];
    let bedIds = (room.beds || []).filter(b => b.id).map(b => b.id);
    const deps = [];
    if (bedCount > 0) deps.push(`${bedCount} Bed${bedCount !== 1 ? 's' : ''}`);

    confirmReduction(
      `Are you sure you want to delete ${room.name || `Room ${rIdx + 1}`}? This will permanently discard all configured beds inside it.`,
      executeDelete,
      deps,
      roomIds,
      bedIds
    );
  };

  const removeWardBed = (bIdx, fIdx, wIdx, bItemIdx) => {
    const ward = buildings[bIdx].floors[fIdx].wards[wIdx];
    const bedName = ward.bedNames[bItemIdx];
    const bedId = (ward.beds && ward.beds[bItemIdx]) ? ward.beds[bItemIdx].id : null;
    let bedIds = bedId ? [bedId] : [];
    const executeDelete = () => {
      setBuildings((p) => p.map((b, i) => i !== bIdx ? b : {
        ...b, floors: b.floors.map((f, j) => j !== fIdx ? f : {
          ...f, wards: f.wards.map((w, k) => k !== wIdx ? w : {
            ...w, bedNames: (w.bedNames || []).filter((_, idx) => idx !== bItemIdx),
                  beds: (w.beds || []).filter((_, idx) => idx !== bItemIdx)
          })
        })
      }));
    };

    confirmReduction(
      `Are you sure you want to delete ${bedName || `Bed ${bItemIdx + 1}`}?`,
      executeDelete,
      [],
      [],
      bedIds
    );
  };

  const removeBed = (bIdx, fIdx, wIdx, rIdx, bItemIdx) => {
    const room = buildings[bIdx].floors[fIdx].wards[wIdx].rooms[rIdx];
    const bedName = room.bedNames[bItemIdx];
    const bedId = (room.beds && room.beds[bItemIdx]) ? room.beds[bItemIdx].id : null;
    let bedIds = bedId ? [bedId] : [];
    const executeDelete = () => {
      setBuildings((p) => p.map((b, i) => i !== bIdx ? b : {
        ...b, floors: b.floors.map((f, j) => j !== fIdx ? f : {
          ...f, wards: f.wards.map((w, k) => k !== wIdx ? w : {
            ...w, rooms: w.rooms.map((r, l) => l !== rIdx ? r : {
              ...r, bedNames: r.bedNames.filter((_, idx) => idx !== bItemIdx),
                    beds: (r.beds || []).filter((_, idx) => idx !== bItemIdx)
            })
          })
        })
      }));
    };

    confirmReduction(
      `Are you sure you want to delete ${bedName || `Bed ${bItemIdx + 1}`}?`,
      executeDelete,
      [],
      [],
      bedIds
    );
  };

  const restoreNode = (type, bIdx, fIdx, wIdx, rIdx) => {
    setBuildings((p) => {
      const copy = JSON.parse(JSON.stringify(p));
      if (type === "building") copy[bIdx].isActive = true;
      else if (type === "floor") copy[bIdx].floors[fIdx].isActive = true;
      else if (type === "ward" || type === "room-standalone") copy[bIdx].floors[fIdx].wards[wIdx].isActive = true;
      else if (type === "room") copy[bIdx].floors[fIdx].wards[wIdx].rooms[rIdx].isActive = true;
      return copy;
    });
  };

  const handleSave = async () => {
    if (duplicateBedConflicts.length > 0) {
      notify(`Duplicate bed names must be resolved first: ${duplicateBedConflicts.join("; ")}`, "error");
      return;
    }
    setSaving(true);
    try {
      const payload = buildings.map((b) => ({
        name: b.name || "Building",
        floors: (b.floors || []).map((f) => ({
          name: f.name || "Floor",
          wards: [
            ...(f.wards || []).map((w) => ({
              id: w.id || null,
              name: w.name || (w.nodeType === "room" ? "Room" : "Ward"),
              roomType: w.roomType || "GENERAL",
              dailyCharge: w.dailyCharge === "" || w.dailyCharge == null
                ? null
                : Number(w.dailyCharge),
              bedNames: w.nodeType === "room" ? [] : (w.bedNames || []),
              rooms: w.nodeType === "room"
                ? [{ id: w.rooms?.[0]?.id || null, name: w.name || "Room", bedNames: w.rooms?.[0]?.bedNames || [], isActive: w.rooms?.[0]?.isActive ?? true }]
                : (w.rooms || []).map((r) => ({
                  id: r.id || null,
                  name: r.name || "",
                  isActive: r.isActive ?? true,
                  roomType: r.roomType || null,
                  bedNames: r.bedNames || [],
                })),
            })),
          ],
        })),
      }));
      await infrastructureApi.save(user.hospitalId, payload);
      setIsDirty(false);
      notify("Hospital infrastructure updated and synced successfully!", "success");
    } catch (err) {
      // 409 carries {reasons: [...]} from InfrastructureValidationException; anything
      // else (500s, network) only has a message worth showing.
      const data = err?.response?.data;
      const reasons = Array.isArray(data?.reasons) ? data.reasons.filter(Boolean) : [];
      const detail = reasons.length
        ? reasons.join(" • ")
        : (typeof data === "string" ? data : data?.message || data?.error || err?.message || "");
      notify(
        detail
          ? `Failed to save infrastructure configuration: ${detail}`
          : "Failed to save infrastructure configuration",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // Node editing handlers
  const openEditModal = (type, bIdx, fIdx = null, wIdx = null, rIdx = null, bItemIdx = null) => {
    let formState = {};
    if (type === "building") {
      formState = { name: buildings[bIdx].name };
    } else if (type === "floor") {
      formState = { name: buildings[bIdx].floors[fIdx].name };
    } else if (type === "ward") {
      const ward = buildings[bIdx].floors[fIdx].wards[wIdx];
      formState = {
        name: ward.name,
        roomType: ward.roomType || "GENERAL",
        dailyCharge: ward.dailyCharge ?? "",
        roomsCount: (ward.rooms || []).length,
        rooms: (ward.rooms || []).map(r => ({ ...r }))
      };
    } else if (type === "room") {
      // Standalone room in Col 3
      const roomNode = buildings[bIdx].floors[fIdx].wards[wIdx];
      const actualRoom = (roomNode.rooms || [])[0] || { name: roomNode.name, bedNames: [] };
      formState = {
        name: roomNode.name,
        roomType: roomNode.roomType || "OT",
        dailyCharge: roomNode.dailyCharge ?? ""
      };
    } else if (type === "ward-room") {
      // Room inside a Ward in Col 4
      const ward = buildings[bIdx].floors[fIdx].wards[wIdx];
      const room = ward.rooms[rIdx];
      formState = {
        name: room.name,
        roomType: room.roomType || (ward.roomType === "GENERAL" ? "PRIVATE" : ward.roomType),
        dailyCharge: room.dailyCharge != null && room.dailyCharge !== "" ? room.dailyCharge : (ward.dailyCharge ?? "")
      };
    } else if (type === "bed") {
      const ward = buildings[bIdx].floors[fIdx].wards[wIdx];
      const room = ward.rooms[rIdx];

      let effectiveCharge = null;
      let inheritedFrom = "";
      if (ward.nodeType === 'room') {
        effectiveCharge = ward.dailyCharge;
        inheritedFrom = "Standalone Room";
      } else {
        if (room.dailyCharge != null && room.dailyCharge !== "") {
          effectiveCharge = room.dailyCharge;
          inheritedFrom = "Room Override";
        } else {
          effectiveCharge = ward.dailyCharge;
          inheritedFrom = "Ward Base Charge";
        }
      }

      formState = {
        name: room.bedNames[bItemIdx] || "",
        effectiveCharge,
        inheritedFrom
      };
    } else if (type === "ward-bed") {
      const ward = buildings[bIdx].floors[fIdx].wards[wIdx];
      formState = {
        name: ward.bedNames[bItemIdx] || "",
        effectiveCharge: ward.dailyCharge,
        inheritedFrom: "Ward Base Charge"
      };
    }

    setEditModal({
      show: true,
      type,
      bIdx,
      fIdx,
      wIdx,
      rIdx,
      bItemIdx,
      formState
    });
  };

  const handleSaveEdit = () => {
    const { type, bIdx, fIdx, wIdx, rIdx, bItemIdx, formState } = editModal;

    setBuildings(p => {
      return p.map((b, i) => {
        if (i !== bIdx) return b;

        if (type === "building") {
          return { ...b, name: formState.name };
        }

        return {
          ...b,
          floors: b.floors.map((f, j) => {
            if (j !== fIdx) return f;

            if (type === "floor") {
              return { ...f, name: formState.name };
            }

            return {
              ...f,
              wards: f.wards.map((w, k) => {
                if (k !== wIdx) return w;

                if (type === "room") {
                  return {
                    ...w,
                    name: formState.name,
                    roomType: formState.roomType,
                    dailyCharge: formState.dailyCharge === "" || formState.dailyCharge == null ? null : Number(formState.dailyCharge),
                    rooms: [{ id: w.rooms?.[0]?.id || null, isActive: w.rooms?.[0]?.isActive ?? true, name: formState.name, bedNames: w.rooms?.[0]?.bedNames || [] }]
                  };
                }

                if (type === "ward-room") {
                  const updatedRooms = [...w.rooms];
                  updatedRooms[rIdx] = {
                    ...updatedRooms[rIdx],
                    name: formState.name,
                    roomType: formState.roomType,
                    dailyCharge: formState.dailyCharge === "" || formState.dailyCharge == null ? null : Number(formState.dailyCharge)
                  };
                  return { ...w, rooms: updatedRooms };
                }

                if (type === "bed") {
                  const updatedRooms = [...w.rooms];
                  const newBedNames = [...(updatedRooms[rIdx].bedNames || [])];
                  newBedNames[bItemIdx] = formState.name;
                  updatedRooms[rIdx] = { ...updatedRooms[rIdx], bedNames: newBedNames };
                  return { ...w, rooms: updatedRooms };
                }

                if (type === "ward-bed") {
                  const newBedNames = [...(w.bedNames || [])];
                  newBedNames[bItemIdx] = formState.name;
                  return { ...w, bedNames: newBedNames };
                }

                const targetCount = Number(formState.roomsCount) || 0;
                let updatedRooms = formState.rooms || [];
                if (updatedRooms.length !== targetCount) {
                  updatedRooms = resizeTo(updatedRooms, targetCount, (idx) => ({
                    id: null,
                    isActive: true,
                    name: `Room ${idx + 1}`,
                    bedNames: ["Bed 1"]
                  }));
                }

                return {
                  ...w,
                  name: formState.name,
                  roomType: formState.roomType,
                  dailyCharge: formState.dailyCharge === "" || formState.dailyCharge == null
                    ? null
                    : Number(formState.dailyCharge),
                  rooms: updatedRooms
                };
              })
            };
          })
        };
      });
    });

    setEditModal({ show: false, type: null, bIdx: null, fIdx: null, wIdx: null, rIdx: null, bItemIdx: null, formState: {} });
  };

  const handleFormRoomsCountChange = (n) => {
    setEditModal(p => {
      const currentRooms = p.formState.rooms || [];
      const updatedRooms = resizeTo(currentRooms, n, (rIdx) => ({
        id: null,
        isActive: true,
        name: `Room ${rIdx + 1}`,
        bedNames: ["Bed 1"]
      }));

      return {
        ...p,
        formState: {
          ...p.formState,
          roomsCount: n,
          rooms: updatedRooms
        }
      };
    });
  };

  const handleRoomNameChange = (rIdx, value) => {
    setEditModal(p => {
      const updatedRooms = (p.formState.rooms || []).map((r, i) =>
        i === rIdx ? { ...r, name: value } : r
      );
      return {
        ...p,
        formState: {
          ...p.formState,
          rooms: updatedRooms
        }
      };
    });
  };

  const handleRoomBedsCountChange = (rIdx, n) => {
    setEditModal(p => {
      const updatedRooms = [...(p.formState.rooms || [])];
      const room = updatedRooms[rIdx];
      const currentBeds = room.bedNames || [];
      const newBeds = resizeTo(currentBeds, n, (bIdx) => `Bed ${bIdx + 1}`);
      updatedRooms[rIdx] = { ...room, bedNames: newBeds };
      return {
        ...p,
        formState: {
          ...p.formState,
          rooms: updatedRooms
        }
      };
    });
  };

  // Name clash with a sibling node. Beds are `blocking` because the DB rejects them
  // outright — beds carry UNIQUE (room_id, bed_number) and UNIQUE (ward_id, bed_number),
  // so a duplicate inside one room/ward fails the whole save with a 500.
  const editNameConflict = useMemo(() => {
    const { show, type, bIdx, fIdx, wIdx, rIdx, bItemIdx, formState } = editModal;
    const name = (formState?.name || "").trim().toLowerCase();
    if (!show || !name) return null;

    const building = buildings[bIdx];
    const floor = building?.floors?.[fIdx];
    const ward = floor?.wards?.[wIdx];

    let siblings = [];
    let selfIdx = -1;
    let label = "";
    let blocking = false;

    if (type === "building") {
      siblings = buildings.map(b => b.name); selfIdx = bIdx; label = "building";
    } else if (type === "floor") {
      siblings = (building?.floors || []).map(f => f.name); selfIdx = fIdx; label = "floor in this building";
    } else if (type === "ward" || type === "room") {
      siblings = (floor?.wards || []).map(w => w.name); selfIdx = wIdx; label = "node on this floor";
    } else if (type === "ward-room") {
      siblings = (ward?.rooms || []).map(r => r.name); selfIdx = rIdx; label = "room in this ward";
    } else if (type === "bed") {
      siblings = ward?.rooms?.[rIdx]?.bedNames || []; selfIdx = bItemIdx; label = "bed in this room"; blocking = true;
    } else if (type === "ward-bed") {
      siblings = ward?.bedNames || []; selfIdx = bItemIdx; label = "bed in this ward"; blocking = true;
    }

    const clash = siblings.some((n, i) => i !== selfIdx && (n || "").trim().toLowerCase() === name);
    return clash ? { label, blocking } : null;
  }, [editModal, buildings]);

  // Same-name beds inside one room/ward anywhere in the tree — these must be cleared
  // before the layout can be saved.
  const duplicateBedConflicts = useMemo(() => {
    const conflicts = [];
    const scan = (names, path) => {
      findDuplicateNames(names).forEach((key) => {
        const shown = (names || []).find(n => (n || "").trim().toLowerCase() === key);
        conflicts.push(`${path} — "${shown}"`);
      });
    };
    buildings.forEach(b => (b.floors || []).forEach(f => (f.wards || []).forEach(w => {
      const wardPath = `${b.name || "Building"} › ${f.name || "Floor"} › ${w.name || "Ward"}`;
      if (w.nodeType !== "room") scan(w.bedNames, wardPath);
      (w.rooms || []).forEach((r, rIdx) => {
        scan(r.bedNames, w.nodeType === "room" ? wardPath : `${wardPath} › ${r.name || `Room ${rIdx + 1}`}`);
      });
    })));
    return conflicts;
  }, [buildings]);

  // Find active selections matching query
  const activeBuilding = useMemo(() => {
    return filteredTree.find(b => b.originalIdx === activeBuildingIdx) || filteredTree[0];
  }, [filteredTree, activeBuildingIdx]);

  const activeFloor = useMemo(() => {
    if (!activeBuilding) return null;
    return activeBuilding.floors.find(f => f.originalIdx === activeFloorIdx) || activeBuilding.floors[0];
  }, [activeBuilding, activeFloorIdx]);

  const duplicateWardBedNames = useMemo(
    () => findDuplicateNames(activeFloor?.wards?.[activeWardIdx]?.bedNames),
    [activeFloor, activeWardIdx]
  );

  const getWardIcon = (type) => {
    const roomType = roomTypes.find(t => t.value === type);
    const iconName = roomType?.icon || "";

    switch (iconName) {
      case "bed-double": return BedDouble;
      case "bed-single": return BedSingle;
      case "crown": return Crown;
      case "heart-pulse": return HeartPulse;
      case "baby": return Baby;
      case "shield": return Shield;
      case "siren": return Siren;
      case "heart": return Heart;
      case "scissors": return Scissors;
      case "activity": return Activity;
      case "package": return Package;
      case "pill": return Pill;
      case "flask-conical": return FlaskConical;
      case "droplets": return Droplets;
      case "user": return User;
      case "clipboard-plus": return ClipboardPlus;
      case "users": return Users;
      default: return Bed;
    }
  };

  if (loading) {
    return (
      <CenterLoader text="Loading master structure…" />
    );
  }

  // Helper to dynamically stretch the vertical backbone to perfectly meet the incoming horizontal line
  const getMinContentHeight = (prevIdx) => ({
    minHeight: `${80 + (prevIdx * 88)}px`,
    boxSizing: 'border-box'
  });

  return (
    <div className="hms-infra-shell">
      {/* Header Banner */}
      <div className="hms-infra-banner">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Network className="w-5 h-5 hms-infra-banner__icon" />
            <h1 className="hms-infra-banner__title">Hospital Infrastructure Master</h1>
          </div>
          <p className="hms-infra-banner__sub">
            Configure core building maps. Updates reflect in OT and Store modules.
          </p>
        </div>

        {/* Stats Panel */}
        <div className="hms-infra-top-stats">
          <div className="hms-infra-top-stat">
            <span className="hms-infra-top-stat__val">{stats.bldgs}</span>
            <span className="hms-infra-top-stat__lbl">BLDGS</span>
          </div>
          <div className="hms-infra-top-stat">
            <span className="hms-infra-top-stat__val">{stats.floors}</span>
            <span className="hms-infra-top-stat__lbl">FLOORS</span>
          </div>
          <div className="hms-infra-top-stat">
            <span className="hms-infra-top-stat__val">{stats.rooms}</span>
            <span className="hms-infra-top-stat__lbl">ROOMS</span>
          </div>
          <div className="hms-infra-top-stat">
            <span className="hms-infra-top-stat__val">{stats.ots}</span>
            <span className="hms-infra-top-stat__lbl">OTS</span>
          </div>
          <div className="hms-infra-top-stat">
            <span className="hms-infra-top-stat__val">{stats.stores}</span>
            <span className="hms-infra-top-stat__lbl">STORES</span>
          </div>
          <div className="hms-infra-top-stat">
            <span className="hms-infra-top-stat__val">{stats.beds}</span>
            <span className="hms-infra-top-stat__lbl">BEDS</span>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white px-8 py-2 border-bottom flex items-center justify-between gap-4">
        {/* Search filter */}
        <div className="zu-filter-bar__search max-w-sm flex-1">
          <Search className="zu-filter-bar__search-icon" />
          <input
            type="text"
            placeholder="Search wards, rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="zu-filter-bar__search-input"
          />
        </div>

        {/* Helper Instructions */}
        <div className="flex items-center gap-4">
          <p className="text-12 text-gray-500 m-0 hidden md:block">
            💡 Click a Block or Floor card to navigate the visual hierarchy tree.
          </p>
          <label className="flex items-center gap-2 cursor-pointer text-12 font-medium text-gray-700 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => {
                if (isDirty) {
                  notify("Please save or discard unsaved changes before toggling archive view.", "warning");
                  return;
                }
                setShowInactive(e.target.checked);
              }}
              className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
            />
            Show Inactive
          </label>
        </div>
      </div>

      {/* Main Visual Tree Workspace */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden bg-gray-50 min-h-0 infra-tree-hide-scrollbar">
        <div className="infra-tree-workspace h-full min-h-full">

          {/* COLUMN 1: BUILDINGS */}
          <div className="infra-tree-col">
            <div className="infra-tree-col-header">
              <span className="infra-tree-col-title">
                <Building2 className="w-4 h-4 text-gray-500" /> Blocks
              </span>
              <span className="infra-tree-col-count">{filteredTree.length}</span>
            </div>
            <div className="infra-tree-col-content">
              {filteredTree.map((b) => {
                const isBActive = activeBuildingIdx === b.originalIdx;
                const hasFloors = (b.floors || []).length > 0;
                return (
                  <div
                    key={b.originalIdx}
                    onClick={() => {
                      setActiveBuildingIdx(b.originalIdx);
                      setActiveFloorIdx(0);
                    }}
                    className={`infra-tree-card${isBActive ? " is-active" : ""}${hasFloors ? " has-children" : ""}${b.isActive === false ? " opacity-50 grayscale" : ""}`}
                  >
                    <div className="infra-tree-card__icon-wrap">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="infra-tree-card__info">
                      <h4 className="infra-tree-card__name truncate">
                        {b.isActive === false && <span className="text-gray-500 mr-1 font-normal">(Inactive)</span>}
                        {b.name || `Building ${b.originalIdx + 1}`}
                      </h4>
                      <p className="infra-tree-card__meta">{(b.floors || []).length} Floors</p>
                    </div>
                    <div className="infra-tree-card__actions" onClick={(e) => e.stopPropagation()}>
                      {b.isActive === false ? (
                        <button type="button" onClick={() => restoreNode('building', b.originalIdx)} className="infra-tree-card__btn text-green-600 hover:bg-green-50" title="Restore"><RefreshCcw className="w-3.5 h-3.5" /></button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal("building", b.originalIdx)}
                            className="infra-tree-card__btn"
                            title="Edit Name"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBuilding(b.originalIdx)}
                            className="infra-tree-card__btn is-danger"
                            title="Delete Building"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    {(hasFloors || isBActive) && (
                      <div className={`infra-tree-connection-badge ${isBActive ? "is-active" : "is-inactive"}`}>
                        {(b.floors || []).length}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={handleAddBuilding}
                className="infra-tree-add-card-btn"
              >
                <Plus className="w-4 h-4" /> Add Block
              </button>
            </div>
          </div>

          {/* COLUMN 2: FLOORS */}
          <div className="infra-tree-col">
            <div className="infra-tree-col-header">
              <span className="infra-tree-col-title">
                <Layers className="w-4 h-4 text-gray-500" /> Floors
              </span>
              <span className="infra-tree-col-count">
                {activeBuilding ? (activeBuilding.floors || []).length : 0}
              </span>
            </div>
            <div
              className={`infra-tree-col-content${activeBuilding ? " is-connected" : ""}${activeBuilding && (activeBuilding.floors || []).length === 0 ? " is-empty" : ""}`}
              style={activeBuilding ? getMinContentHeight(activeBuildingIdx) : undefined}
            >
              {!activeBuilding ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-400">
                  <Building2 className="w-8 h-8 mb-2 opacity-55" />
                  <p className="text-12 font-medium">Select a building block to view floors</p>
                </div>
              ) : (
                <>
                  {(activeBuilding.floors || []).map((f) => {
                    const isFActive = activeFloorIdx === f.originalIdx;
                    const hasWards = (f.wards || []).length > 0;
                    return (
                      <div
                        key={f.originalIdx}
                        onClick={() => setActiveFloorIdx(f.originalIdx)}
                        className={`infra-tree-card${isFActive ? " is-active" : ""}${hasWards ? " has-children" : ""}${f.isActive === false ? " opacity-50 grayscale" : ""}`}
                      >
                        <div className="infra-tree-card__icon-wrap">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div className="infra-tree-card__info">
                          <h4 className="infra-tree-card__name truncate">
                            {f.isActive === false && <span className="text-gray-500 mr-1 font-normal">(Inactive)</span>}
                            {f.name || `Floor ${f.originalIdx + 1}`}
                          </h4>
                          <p className="infra-tree-card__meta">{(f.wards || []).length} Zones</p>
                        </div>
                        <div className="infra-tree-card__actions" onClick={(e) => e.stopPropagation()}>
                          {f.isActive === false ? (
                            <button type="button" onClick={() => restoreNode('floor', activeBuildingIdx, f.originalIdx)} className="infra-tree-card__btn text-green-600 hover:bg-green-50" title="Restore"><RefreshCcw className="w-3.5 h-3.5" /></button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal("floor", activeBuildingIdx, f.originalIdx)}
                                className="infra-tree-card__btn"
                                title="Edit Name"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteFloor(activeBuildingIdx, f.originalIdx)}
                                className="infra-tree-card__btn is-danger"
                                title="Delete Floor"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>

                        {(hasWards || isFActive) && (
                          <div className={`infra-tree-connection-badge ${isFActive ? "is-active" : "is-inactive"}`}>
                            {(f.wards || []).length}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleAddFloor(activeBuildingIdx)}
                    className="infra-tree-add-card-btn"
                  >
                    <Plus className="w-4 h-4" /> Add Floor
                  </button>
                </>
              )}
            </div>
          </div>

          {/* COLUMN 3: WARD / ROOM */}
          <div className="infra-tree-col">
            <div className="infra-tree-col-header">
              <span className="infra-tree-col-title">
                <Bed className="w-4 h-4 text-gray-500" /> Floor Zones
              </span>
              <span className="infra-tree-col-count">
                {activeFloor ? (activeFloor.wards || []).length : 0}
              </span>
            </div>
            <div
              className={`infra-tree-col-content${activeFloor ? " is-connected" : ""}${activeFloor && (activeFloor.wards || []).length === 0 ? " is-empty" : ""}`}
              style={activeFloor ? getMinContentHeight(activeFloorIdx) : undefined}
            >
              {!activeFloor ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-400">
                  <Layers className="w-8 h-8 mb-2 opacity-55" />
                  <p className="text-12 font-medium">Select a floor to view zones</p>
                </div>
              ) : (
                <>
                  {(activeFloor.wards || []).map((w, wIdx) => {
                    const WardIcon = getWardIcon(w.roomType);
                    let tagClass = "infra-tree-badge-tag is-general";
                    if (w.roomType === "ICU") tagClass = "infra-tree-badge-tag is-icu";
                    else if (w.roomType === "PRIVATE") tagClass = "infra-tree-badge-tag is-private";
                    else if (w.roomType === "OT" || w.roomType === "CATH_LAB") tagClass = "infra-tree-badge-tag is-ot";
                    else if (w.roomType === "STORE") tagClass = "infra-tree-badge-tag is-store";

                    const isWActive = activeWardIdx === wIdx;
                    const isWardNode = w.nodeType !== 'room';

                    return (
                      <div
                        key={wIdx}
                        onClick={() => {
                          setActiveWardIdx(wIdx);
                          if (isWardNode) setActiveRoomIdx(0);
                        }}
                        className={`infra-tree-card${isWActive ? " is-active" : ""}${isWardNode ? " has-children" : ""}${w.isActive === false ? " opacity-50 grayscale" : ""}`}
                      >
                        <div className="infra-tree-card__icon-wrap">
                          <WardIcon size={18} className="text-blue-500" />
                        </div>
                        <div className="infra-tree-card__info">
                          <h4 className="infra-tree-card__name truncate">
                            {w.isActive === false && <span className="text-gray-500 mr-1 font-normal">(Inactive)</span>}
                            {w.name || `Node ${wIdx + 1}`}
                          </h4>
                          <div className="infra-tree-card__meta truncate">
                            <span className={tagClass}>{w.roomType}</span>
                            {supportsDailyCharge(w.roomType) && w.dailyCharge != null && w.dailyCharge !== "" && `₹${w.dailyCharge}/d • `}
                            {isWardNode ? (
                              <>{(w.rooms || []).length} Rooms{supportsBeds(w.roomType) ? ` • ${(w.rooms?.reduce((acc, r) => acc + (r.bedNames?.length || 0), 0) || 0) + (w.bedNames?.length || 0)} Beds` : ''}</>
                            ) : (
                              supportsBeds(w.roomType) ? <>{w.rooms?.[0]?.bedNames?.length || 0} Beds</> : null
                            )}
                          </div>
                        </div>
                        <div className="infra-tree-card__actions" onClick={(e) => e.stopPropagation()}>
                          {w.isActive === false ? (
                            <button type="button" onClick={() => restoreNode(isWardNode ? 'ward' : 'room-standalone', activeBuildingIdx, activeFloorIdx, wIdx)} className="infra-tree-card__btn text-green-600 hover:bg-green-50" title="Restore"><RefreshCcw className="w-3.5 h-3.5" /></button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(isWardNode ? "ward" : "room", activeBuildingIdx, activeFloorIdx, wIdx)}
                                className="infra-tree-card__btn"
                                title="Edit Details"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeWard(activeBuildingIdx, activeFloorIdx, wIdx)}
                                className="infra-tree-card__btn is-danger"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>

                        {(isWardNode || (isWActive && supportsBeds(w.roomType))) && (
                          <div className={`infra-tree-connection-badge ${isWActive ? "is-active" : "is-inactive"}`}>
                            {isWardNode ? (w.rooms || []).length : 0}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="infra-tree-add-btn-group">
                    <button
                      type="button"
                      onClick={() => setAddZoneRoomModal({ isOpen: true, target: 'floor', bIdx: activeBuildingIdx, fIdx: activeFloorIdx, wIdx: null, selectedType: 'ward', name: "", roomType: roomTypes[0]?.value || "", dailyCharge: "", bedCount: 1 })}
                      className="infra-tree-add-card-btn flex-1"
                    >
                      <Plus className="w-4 h-4" /> Add
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* COLUMN 4: ROOMS (Only visible if active item in Col 3 is a Ward) */}
          {activeFloor && activeFloor.wards?.[activeWardIdx] && activeFloor.wards[activeWardIdx].nodeType !== 'room' && (
            <div className="infra-tree-col">
              <div className="infra-tree-col-header">
                <span className="infra-tree-col-title">
                  <Bed className="w-4 h-4 text-gray-500" /> {(() => {
                    const rCount = (activeFloor.wards[activeWardIdx].rooms || []).length;
                    const bCount = (activeFloor.wards[activeWardIdx].bedNames || []).length;
                    if (rCount > 0 && bCount > 0) return "Rooms & Beds";
                    if (bCount > 0 && rCount === 0) return "Beds";
                    return "Rooms";
                  })()}
                </span>
                <span className="infra-tree-col-count">
                  {(activeFloor.wards[activeWardIdx].rooms || []).length + (activeFloor.wards[activeWardIdx].bedNames || []).length}
                </span>
              </div>
              <div
                className={`infra-tree-col-content is-connected${(activeFloor.wards[activeWardIdx].rooms || []).length === 0 ? " is-empty" : ""}`}
                style={getMinContentHeight(activeWardIdx)}
              >
                {(activeFloor.wards[activeWardIdx].rooms || []).map((r, rIdx) => {
                  const isRActive = activeRoomIdx === rIdx;
                  return (
                    <div
                      key={rIdx}
                      onClick={() => setActiveRoomIdx(rIdx)}
                      className={`infra-tree-card${isRActive ? " is-active" : ""} has-children${r.isActive === false ? " opacity-50 grayscale" : ""}`}
                    >
                      <div className="infra-tree-card__icon-wrap">
                        <Bed className="w-5 h-5" />
                      </div>
                      <div className="infra-tree-card__info">
                        <h4 className="infra-tree-card__name truncate">
                          {r.isActive === false && <span className="text-gray-500 mr-1 font-normal">(Inactive)</span>}
                          {r.name || `Room ${rIdx + 1}`}
                        </h4>
                        <div className="infra-tree-card__meta truncate">
                          <span className={`infra-tree-badge-tag ${r.roomType ? 'is-info' : 'is-general'}`}>{r.roomType || 'ROOM'}</span>
                          {supportsBeds(r.roomType || activeFloor.wards[activeWardIdx].roomType) && ` ${(r.bedNames || []).length} Beds`}
                          {supportsDailyCharge(r.roomType || activeFloor.wards[activeWardIdx].roomType) && (r.dailyCharge != null
                            ? ` • ₹${r.dailyCharge}/d`
                            : (activeFloor.wards[activeWardIdx].dailyCharge != null ? ` • Inherits ₹${activeFloor.wards[activeWardIdx].dailyCharge}/d` : ""))}
                        </div>
                      </div>
                      <div className="infra-tree-card__actions" onClick={(e) => e.stopPropagation()}>
                        {r.isActive === false ? (
                          <button type="button" onClick={() => restoreNode('room', activeBuildingIdx, activeFloorIdx, activeWardIdx, rIdx)} className="infra-tree-card__btn text-green-600 hover:bg-green-50" title="Restore"><RefreshCcw className="w-3.5 h-3.5" /></button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal("ward-room", activeBuildingIdx, activeFloorIdx, activeWardIdx, rIdx)}
                              className="infra-tree-card__btn"
                              title="Edit Name"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRoom(activeBuildingIdx, activeFloorIdx, activeWardIdx, rIdx)}
                              className="infra-tree-card__btn is-danger"
                              title="Delete Room"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>

                      {supportsBeds(r.roomType || activeFloor.wards[activeWardIdx].roomType) && (
                        <div className={`infra-tree-connection-badge ${isRActive ? "is-active" : "is-inactive"}`}>
                          {(r.bedNames || []).length}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {(activeFloor.wards[activeWardIdx].bedNames || []).map((bedName, bedIdx) => (
                    <div
                      key={`ward-bed-${bedIdx}`}
                      className="infra-tree-card"
                    >
                      <div className="infra-tree-card__icon-wrap">
                        <Bed className="w-5 h-5 text-gray-500" />
                      </div>
                      <div className="infra-tree-card__info">
                        <h4 className="infra-tree-card__name truncate">
                          {bedName || `Bed ${bedIdx + 1}`}
                          {duplicateWardBedNames.has((bedName || "").trim().toLowerCase()) && (
                            <AlertTriangle
                              className="w-3.5 h-3.5 text-amber-500 inline-block ml-1.5 align-text-bottom shrink-0"
                              title="Another bed in this ward has the same name"
                            />
                          )}
                        </h4>
                        <div className="infra-tree-card__meta text-gray-500">Ward Bed</div>
                      </div>
                      <div className="infra-tree-card__actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openEditModal("ward-bed", activeBuildingIdx, activeFloorIdx, activeWardIdx, null, bedIdx)}
                          className="infra-tree-card__btn"
                          title="Edit Name"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeWardBed(activeBuildingIdx, activeFloorIdx, activeWardIdx, bedIdx)}
                          className="infra-tree-card__btn is-danger"
                          title="Delete Bed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAddZoneRoomModal({ 
                    isOpen: true, 
                    target: 'ward', 
                    bIdx: activeBuildingIdx, 
                    fIdx: activeFloorIdx, 
                    wIdx: activeWardIdx, 
                    selectedType: supportsBeds(activeFloor.wards[activeWardIdx].roomType) ? 'beds' : 'room', 
                    name: "", 
                    roomType: roomTypes[0]?.value || "", 
                    dailyCharge: "", 
                    bedCount: 1 
                  })}
                  className="infra-tree-add-card-btn"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
          )}

          {/* COLUMN 5: BEDS */}
          {activeFloor && activeFloor.wards?.[activeWardIdx] && (
            (() => {
              const ward = activeFloor.wards[activeWardIdx];
              // If it's a standalone room, we edit its beds directly. Otherwise, we edit the activeRoomIdx.
              const rIdx = ward.nodeType === 'room' ? 0 : activeRoomIdx;
              const room = (ward.rooms || [])[rIdx];

              if (!room) return null;
              
              const effectiveType = ward.nodeType === 'room' ? ward.roomType : (room.roomType || ward.roomType);
              if (!supportsBeds(effectiveType)) return null;

              const duplicateBedNames = findDuplicateNames(room.bedNames);

              return (
                <div className="infra-tree-col">
                  <div className="infra-tree-col-header">
                    <span className="infra-tree-col-title">
                      <Bed className="w-4 h-4 text-gray-500" /> Beds
                    </span>
                    <span className="infra-tree-col-count">
                      {(room.bedNames || []).length}
                    </span>
                  </div>
                  <div
                    className={`infra-tree-col-content is-connected${(room.bedNames || []).length === 0 ? " is-empty" : ""}`}
                    style={getMinContentHeight(ward.nodeType === 'room' ? activeWardIdx : activeRoomIdx)}
                  >
                    {(room.bedNames || []).map((bedName, bItemIdx) => {
                      return (
                        <div
                          key={bItemIdx}
                          className="infra-tree-card"
                        >
                          <div className="infra-tree-card__icon-wrap">
                            <Bed className="w-5 h-5" />
                          </div>
                          <div className="infra-tree-card__info">
                            <h4 className="infra-tree-card__name truncate">
                              {bedName || `Bed ${bItemIdx + 1}`}
                              {duplicateBedNames.has((bedName || "").trim().toLowerCase()) && (
                                <AlertTriangle
                                  className="w-3.5 h-3.5 text-amber-500 inline-block ml-1.5 align-text-bottom shrink-0"
                                  title="Another bed in this room has the same name"
                                />
                              )}
                            </h4>
                          </div>
                          <div className="infra-tree-card__actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditModal("bed", activeBuildingIdx, activeFloorIdx, activeWardIdx, rIdx, bItemIdx)}
                              className="infra-tree-card__btn"
                              title="Edit Name"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeBed(activeBuildingIdx, activeFloorIdx, activeWardIdx, rIdx, bItemIdx)}
                              className="infra-tree-card__btn is-danger"
                              title="Delete Bed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => handleAddBedToRoom(activeBuildingIdx, activeFloorIdx, activeWardIdx, rIdx)}
                      className="infra-tree-add-card-btn"
                    >
                      <Plus className="w-4 h-4" /> Add Bed
                    </button>
                  </div>
                </div>
              );
            })()
          )}

        </div>
      </div>

      {/* Sticky Save Bar */}
      {buildings.length > 0 && (
        <div className="hms-infra-save-bar">
          <div className="hms-infra-save-bar__content">
            <div>
              <p className="hms-infra-save-bar__title">Sync core master settings.</p>
              {duplicateBedConflicts.length > 0 ? (
                <div className="mt-0.5 flex items-start gap-2 text-red-600">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-12 m-0 leading-tight">
                    Rename duplicate beds before saving — beds in the same room or ward must have unique names:
                    {" "}{duplicateBedConflicts.slice(0, 3).join("; ")}
                    {duplicateBedConflicts.length > 3 ? ` (+${duplicateBedConflicts.length - 3} more)` : ""}
                  </p>
                </div>
              ) : (
                <p className="hms-infra-save-bar__sub mt-0.5">
                  Saved changes automatically reflect across surgical OTs and warehouse inventory stores.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || duplicateBedConflicts.length > 0}
            className="zu-btn-primary"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving Changes…" : "Save Master Layout"}
          </button>
        </div>
      )}

      {/* safety Confirmation Modal */}
      {confirmModal.show && (
        <div className="hms-infra-modal-overlay">
          <div className="hms-infra-modal">
            <div className="hms-infra-modal__header">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <h3 className="hms-infra-modal__title">Confirm Removal</h3>
            </div>
            <p className="hms-infra-modal__body" style={{ paddingTop: '4px', marginBottom: '16px' }}>
              {confirmModal.message}
            </p>

            <div className="hms-infra-modal__warning">
              <div className="hms-infra-modal__warning-content">
                <div>
                  <h4 className="hms-infra-modal__warning-title">Critical Data Loss Warning</h4>
                  <p className="hms-infra-modal__warning-text">
                    Deleting this infrastructure will cascade and collapse all associated <strong>Past Histories</strong>, <strong>Current Patient Admissions</strong>, and <strong>Active Billings</strong> linked to these units. This action is irreversible.
                  </p>
                </div>
              </div>
            </div>

            {confirmModal.dependencies && confirmModal.dependencies.length > 0 && (
              <div className="hms-infra-modal__deps">
                <p className="hms-infra-modal__deps-title">
                  <Layers className="hms-infra-modal__deps-icon" />
                  The following dependencies will also be destroyed:
                </p>
                <div className="hms-infra-modal__deps-box">
                  <ul className="hms-infra-modal__deps-list">
                    {confirmModal.dependencies.map((dep, idx) => (
                      <li key={idx} className="hms-infra-modal__deps-item">
                        <strong>{dep.split(' ')[0]}</strong> {dep.substring(dep.indexOf(' ') + 1)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {confirmModal.validation && confirmModal.validation.blocked && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-13 font-semibold text-red-700 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Cannot Remove Infrastructure
                </h4>
                <ul className="list-disc list-inside text-13 text-red-600 space-y-1">
                  {confirmModal.validation.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {confirmModal.validation && !confirmModal.validation.blocked && confirmModal.validation.warnings && confirmModal.validation.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="text-13 font-semibold text-amber-700 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Warnings
                </h4>
                <ul className="list-disc list-inside text-13 text-amber-600 space-y-1 mb-3">
                  {confirmModal.validation.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-13 font-medium text-amber-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledgeWarnings}
                    onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  I acknowledge these warnings
                </label>
              </div>
            )}

            {!confirmModal.validation?.blocked && (
              <div className="hms-infra-modal__input-group mt-4">
                <label className="block text-13 font-medium text-slate-700 mb-1.5">
                  Type <strong>DELETE</strong> to confirm
                </label>
                <input
                  type="text"
                  className="hms-infra-modal__input"
                  placeholder="DELETE"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </div>
            )}
            
            <div className="hms-infra-modal__footer mt-6">
              <button
                type="button"
                onClick={() => setConfirmModal({ show: false, message: "", onConfirm: null })}
                className="hms-infra-modal__cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                disabled={
                  confirmModal.validation?.blocked || 
                  confirmText !== "DELETE" || 
                  (confirmModal.validation?.warnings?.length > 0 && !acknowledgeWarnings)
                }
                className="hms-infra-modal__confirm-btn is-danger disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Blocker Modal */}
      {blocker.state === "blocked" && (
        <div className="hms-infra-modal-overlay">
          <div className="hms-infra-modal">
            <div className="hms-infra-modal__header">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
              <h3 className="hms-infra-modal__title">Unsaved Changes</h3>
            </div>
            <p className="hms-infra-modal__body">
              You have unsaved changes to your hospital infrastructure. If you leave this page now, your changes will be permanently lost.
            </p>
            <div className="hms-infra-modal__footer">
              <button
                type="button"
                onClick={() => blocker.reset()}
                className="hms-infra-modal__cancel-btn"
              >
                Stay on Page
              </button>
              <button
                type="button"
                onClick={() => blocker.proceed()}
                className="hms-infra-modal__confirm-btn is-danger"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editModal.show && (
        <Modal
          isOpen={editModal.show}
          onClose={() => setEditModal({ show: false, type: null, bIdx: null, fIdx: null, wIdx: null, formState: {} })}
          title={`Edit ${editModal.type.charAt(0).toUpperCase() + editModal.type.slice(1)}`}
          footer={
            <>
              <Button
                variant="cancel"
                onClick={() => setEditModal({ show: false, type: null, bIdx: null, fIdx: null, wIdx: null, formState: {} })}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveEdit}
                disabled={!editModal.formState.name?.trim() || Boolean(editNameConflict?.blocking)}
              >
                Apply Changes
              </Button>
            </>
          }
        >
          <div className="infra-modal-form-grid">
            <FormGroup
              label={
                editModal.type === "bed" ? "Bed Name" :
                  editModal.type === "ward-room" ? "Room Name" :
                    `${editModal.type.charAt(0).toUpperCase() + editModal.type.slice(1)} Name`
              }
              hint="Required name/identifier"
            >
              <Input
                value={editModal.formState.name || ""}
                onChange={(e) => setEditModal(p => ({ ...p, formState: { ...p.formState, name: e.target.value } }))}
                placeholder={`e.g. Block A or Floor 1`}
              />
            </FormGroup>

            {editNameConflict && (
              <div className={`p-3 rounded-lg flex items-start gap-3 ${editNameConflict.blocking ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${editNameConflict.blocking ? "text-red-600" : "text-amber-600"}`} />
                <p className={`text-12 m-0 leading-tight ${editNameConflict.blocking ? "text-red-800" : "text-amber-800"}`}>
                  Another {editNameConflict.label} is already named "{editModal.formState.name.trim()}".
                  {editNameConflict.blocking
                    ? " Beds in the same room or ward must have unique names — pick a different one."
                    : " You can still save this, but duplicate names are harder to tell apart."}
                </p>
              </div>
            )}

            {(editModal.type === "ward" || editModal.type === "room" || editModal.type === "ward-room") && (
              <div className="grid grid-cols-2 gap-4">
                <FormGroup label="Type">
                  <Select
                    value={editModal.formState.roomType}
                    onChange={(e) => setEditModal(p => ({ ...p, formState: { ...p.formState, roomType: e.target.value } }))}
                  >
                    {roomTypes
                      .filter(t => editModal.type === "ward" ? t.category === "WARD" : t.category !== "WARD")
                      .map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                  </Select>
                </FormGroup>

                {supportsDailyCharge(editModal.formState.roomType) && (
                  <FormGroup label="Daily Charge (₹)">
                    <Input
                      type="number"
                      min="0"
                      value={editModal.formState.dailyCharge ?? ""}
                      onChange={(e) => setEditModal(p => ({ ...p, formState: { ...p.formState, dailyCharge: e.target.value } }))}
                      placeholder="0"
                    />
                  </FormGroup>
                )}
              </div>
            )}

            {editModal.type === "bed" && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                <div className="bg-blue-100 p-1.5 rounded-md mt-0.5 shrink-0">
                  <Info className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-13 font-semibold text-blue-900 m-0 leading-tight">
                    Applied Daily Charge: {editModal.formState.effectiveCharge ? `₹${editModal.formState.effectiveCharge}` : "Not Configured"}
                  </p>
                  <p className="text-11 text-blue-700 m-0 mt-1 leading-tight">
                    {editModal.formState.effectiveCharge
                      ? `This bed inherits its pricing from the ${editModal.formState.inheritedFrom} configuration.`
                      : "No pricing has been configured for this room or its parent ward."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ADD ZONE OR ROOM MODAL */}
      {addZoneRoomModal.isOpen && (
        <Modal
          isOpen={addZoneRoomModal.isOpen}
          onClose={() => setAddZoneRoomModal({ isOpen: false })}
          title="Add Node"
          size="sm"
          footer={
            <>
              <Button variant="cancel" onClick={() => setAddZoneRoomModal({ isOpen: false })}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (addZoneRoomModal.target === 'floor') {
                    handleAddWardOrRoom(
                      addZoneRoomModal.bIdx, 
                      addZoneRoomModal.fIdx, 
                      addZoneRoomModal.selectedType, 
                      addZoneRoomModal.name, 
                      addZoneRoomModal.roomType, 
                      addZoneRoomModal.dailyCharge
                    );
                  } else {
                    handleAddNodeToWard(
                      addZoneRoomModal.bIdx, 
                      addZoneRoomModal.fIdx,
                      addZoneRoomModal.wIdx,
                      addZoneRoomModal.selectedType,
                      addZoneRoomModal.name,
                      addZoneRoomModal.roomType,
                      addZoneRoomModal.dailyCharge,
                      addZoneRoomModal.bedCount
                    );
                  }
                  setAddZoneRoomModal({ isOpen: false });
                }}
              >
                Add
              </Button>
            </>
          }
        >
          {addZoneRoomModal.target === 'floor' ? (
            <FormGroup label="Select Node Type">
              <Select
                value={addZoneRoomModal.selectedType}
                onChange={(e) => setAddZoneRoomModal((prev) => ({ 
                  ...prev, 
                  selectedType: e.target.value
                }))}
              >
                <option value="ward">Ward / Zone</option>
                <option value="room">Room</option>
              </Select>
            </FormGroup>
          ) : (
            <FormGroup label="What would you like to add?">
              <Select
                value={addZoneRoomModal.selectedType}
                onChange={(e) => setAddZoneRoomModal((prev) => ({ 
                  ...prev, 
                  selectedType: e.target.value
                }))}
              >
                <option value="room">Room</option>
                {(addZoneRoomModal.target !== 'ward' || supportsBeds(buildings[addZoneRoomModal.bIdx]?.floors[addZoneRoomModal.fIdx]?.wards[addZoneRoomModal.wIdx]?.roomType)) && (
                  <option value="beds">Bed(s)</option>
                )}
              </Select>
            </FormGroup>
          )}

          <div className="grid grid-cols-1 gap-4 mt-4">
            {addZoneRoomModal.selectedType !== 'beds' && (
              <>
                <FormGroup label="Type">
                  <Select
                    value={addZoneRoomModal.roomType}
                    onChange={(e) => setAddZoneRoomModal(p => ({ ...p, roomType: e.target.value }))}
                  >
                    {roomTypes
                      .filter(t => addZoneRoomModal.selectedType === "ward" ? t.hasBeds : true)
                      .map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                  </Select>
                </FormGroup>

                <FormGroup
                  label={addZoneRoomModal.selectedType === "ward" ? "Ward/Zone Name" : "Room Name"}
                  hint="Optional name/identifier"
                >
                  <Input
                    value={addZoneRoomModal.name || ""}
                    onChange={(e) => setAddZoneRoomModal(p => ({ ...p, name: e.target.value }))}
                    placeholder={addZoneRoomModal.selectedType === "ward" ? "e.g. General Ward A" : "e.g. OT-1"}
                  />
                </FormGroup>

                {supportsDailyCharge(addZoneRoomModal.roomType) && (
                  <FormGroup label="Daily Charge (₹)">
                    <Input
                      type="number"
                      min="0"
                      value={addZoneRoomModal.dailyCharge || ""}
                      onChange={(e) => setAddZoneRoomModal(p => ({ ...p, dailyCharge: e.target.value }))}
                      placeholder="0"
                    />
                  </FormGroup>
                )}
              </>
            )}

            {addZoneRoomModal.selectedType === 'beds' && (
              <FormGroup label="Number of Beds to Add" hint="e.g. 5">
                <Input
                  type="number"
                  min="1"
                  value={addZoneRoomModal.bedCount}
                  onChange={(e) => setAddZoneRoomModal(p => ({ ...p, bedCount: parseInt(e.target.value) || 1 }))}
                />
              </FormGroup>
            )}
          </div>
        </Modal>
      )}

    </div>
  );
}
