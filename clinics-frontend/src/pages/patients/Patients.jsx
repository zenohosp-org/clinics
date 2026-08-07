import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { patientApi } from "@/utils/api";
import PatientModal from "@/components/modals/PatientModal";
import BookAppointmentModal from "@/components/modals/BookAppointmentModal";
import Pagination from "@/components/ui/Pagination";
import PageHeader from "@/components/ui/PageHeader";
import { TableSkeleton, SearchBar } from "@/components/ui";
import Menu from "@/components/ui/Menu";
import { calcAge, formatDate } from "@/utils/validators";
import { fmtId } from "@/utils/idFormat";
import { Users, MoreHorizontal, Pencil, ExternalLink, Calendar } from "lucide-react";

function PatientActionMenu({ p, setModal, setBookModal, navigate }) {
  const items = [
    {
      label: "Edit Patient",
      icon: <Pencil className="w-4 h-4" />,
      onClick: () => setModal({ open: true, patient: p })
    },
    {
      label: "Book Appointment",
      icon: <Calendar className="w-4 h-4" />,
      onClick: () => setBookModal({ open: true, patient: p })
    },
    {
      label: "Patient Details",
      icon: <ExternalLink className="w-4 h-4" />,
      onClick: () => navigate(`/patients/${p.id}`)
    }
  ];

  return (
    <div className="hms-appt-am" onClick={e => e.stopPropagation()}>
      <Menu
        items={items}
        triggerIcon={<MoreHorizontal className="w-5 h-5" />}
        triggerClassName="hms-pat-kebab-btn"
        align="right"
      />
    </div>
  );
}

const PAGE_SIZE = 30;

function Patients() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  const [patients, setPatients] = useState([]);
  const [lastVisitDates, setLastVisitDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);                  // UI is 1-based
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [modal, setModal] = useState({ open: false, patient: null });
  const [bookModal, setBookModal] = useState({ open: false, patient: null });

  const load = () => {
    if (!user?.hospitalId) return;
    setLoading(true);
    patientApi.listPaginated(
      user.hospitalId,
      page - 1,            // backend is 0-based, UI is 1-based
      PAGE_SIZE,
      debouncedSearch
    )
      .then((data) => {
        setPatients(data.patients);
        setLastVisitDates(data.lastVisitDates || {});
        setTotalPages(data.totalPages);
        setTotalElements(data.totalElements);
      })
      .catch(() => notify("Failed to load patients", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);         // reset to first page on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    load();
  }, [user?.hospitalId, page, debouncedSearch]);

  useEffect(() => {
    if (location.state?.openRegistration) {
      setModal({ open: true, patient: null });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const handleSave = async (data) => {
    if (modal.patient) {
      await patientApi.update(modal.patient.id, { ...data, hospitalId: user.hospitalId });
      notify("Patient updated", "success");
    } else {
      await patientApi.create({ ...data, hospitalId: user.hospitalId });
      notify("Patient registered", "success");
    }
    setModal({ open: false, patient: null });
    load();
  };

  // Client-side filtering and slicing deleted: handled on backend

  return (
    <div className="zu-page">

      <PageHeader
        title={<>Patients <span className="hms-pat-page__count">{totalElements}</span></>}
        actions={
          <button className="zu-btn-primary" onClick={() => setModal({ open: true, patient: null })}>
            + Register Patient
          </button>
        }
      />

            <div className="zu-page-content">

      {/* Search */}
      <SearchBar
        value={search}
        onChange={(v) => { setSearch(v); setPage(1); }}
        placeholder="Search by name, UHID or phone…"
      />

      {/* Table card */}
      <div className="hms-pat-table-card">
        <div className="hms-pat-table-wrap">
          <table className="hms-pat-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Age / Gender</th>
                <th>Phone</th>
                <th>Registered</th>
                <th>Last Visit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <TableSkeleton rows={10} columns={6} />
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="hms-pat-table-empty">
                      <div className="hms-pat-table-empty__icon">
                        <Users className="w-5 h-5" />
                      </div>
                      <p className="hms-pat-table-empty__text">
                        {search ? "No patients match your search." : "No patients registered yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                patients.map((p) => {
                  return (
                    <tr key={p.id} onClick={() => navigate(`/patients/${p.id}`)} style={{ cursor: "pointer" }}>
                      <td>
                        <div className="hms-pat-id-cell">
                          <div>
                            <p className="hms-pat-id-cell__name">
                              {p.firstName} {p.lastName}
                            </p>
                            <p className="hms-pat-id-cell__uhid">{fmtId(p.uhid)}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {p.dob ? `${calcAge(p.dob)}y` : "—"} &nbsp;·&nbsp; {p.gender}
                      </td>
                      <td>
                        {p.phone ?? <span className="hms-pat-mute">—</span>}
                      </td>
                      <td>
                        {formatDate(p.createdAt)}
                      </td>
                      <td>
                        {lastVisitDates[p.id]
                          ? formatDate(lastVisitDates[p.id])
                          : <span className="hms-pat-mute">—</span>
                        }
                      </td>
                      <td className="is-right">
                        <PatientActionMenu 
                          p={p} 
                          setModal={setModal} 
                          setBookModal={setBookModal} 
                          navigate={navigate} 
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalElements > 0 && (
          <div className="hms-pat-table-pagination">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalElements}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {modal.open && (
        <PatientModal
          patient={modal.patient}
          onClose={() => setModal({ open: false, patient: null })}
          onSave={handleSave}
        />
      )}
      <BookAppointmentModal
        isOpen={bookModal.open}
        onClose={() => setBookModal({ open: false, patient: null })}
        onSuccess={() => {
          setBookModal({ open: false, patient: null });
          navigate("/appointments");
        }}
        prefilledPatient={bookModal.patient}
      />
                </div>
        </div>
  );
}

export { Patients as default };
