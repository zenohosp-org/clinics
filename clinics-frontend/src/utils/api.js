import axios from "axios";
import { DEV_MOCK_AUTH } from "./devMockAuth";
const DIRECTORY_API_URL = "https://api-directory.zenohosp.com";

// Labs *frontend* origin — distinct from VITE_LABS_API_URL (the API host).
// Used to build absolute "Open report" links into labs' report pages
// (labs.zenohosp.com/lab/reports/{id} and /radiology/reports/{id}). Defaults
// to the labs Vite dev port (5175) so local dev works out of the box.
// Trailing slash stripped so callers can safely concatenate `/path`.
export const LABS_FRONTEND_URL =
  (import.meta.env.VITE_LABS_FRONTEND_URL || "http://localhost:5175").replace(/\/$/, "");
const api = axios.create({
  baseURL: (() => {
    const rawUrl = import.meta.env.VITE_API_URL || "";
    if (!rawUrl || rawUrl === "/api") return "/api";
    const baseUrl = rawUrl.replace(/\/$/, "");
    return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
  })(),
  headers: { "Content-Type": "application/json" },
  withCredentials: true
  // Automatically send/receive HttpOnly cookies
});

// Labs service axios instance — radiology + health-checkups. Same auth model
// as the HMS api instance (SSO cookie via withCredentials, dev mock JWT via
// Bearer header, 401-redirect to /login). Local dev uses /labs-api (Vite
// proxies to localhost:8086); production sets VITE_LABS_API_URL to the
// absolute https://api-labs.zenohosp.com. The base URL normalisation mirrors
// the HMS api instance — accepts /labs-api, a bare host, or a host+/api.
const labsApi = axios.create({
  baseURL: (() => {
    const rawUrl = import.meta.env.VITE_LABS_API_URL || "/labs-api";
    if (rawUrl === "/labs-api") return "/labs-api";
    const baseUrl = rawUrl.replace(/\/$/, "");
    return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
  })(),
  headers: { "Content-Type": "application/json" },
  withCredentials: true
});

// Finance service axios instance — day book, expenses, GST registers.
// Same auth model as `api` and `labsApi`: the shared HttpOnly sso_token rides
// along via withCredentials, and the finance backend authorises on a valid JWT
// alone (its /api/** rules require .authenticated(), with no modules gate), so
// a clinics session is accepted as-is.
//
// Routed through the same-origin /finance-api prefix rather than calling
// https://api-finance.zenohosp.com directly, for the same reason labs is: a
// same-origin request sends no Origin header, so there is no CORS preflight and
// no need to add clinics to the finance service's allowed-origins list. nginx
// (prod) and the Vite proxy (dev) both rewrite /finance-api → /api upstream.
const financeApi = axios.create({
  baseURL: (() => {
    const rawUrl = import.meta.env.VITE_FINANCE_API_URL || "/finance-api";
    if (rawUrl === "/finance-api") return "/finance-api";
    const baseUrl = rawUrl.replace(/\/$/, "");
    return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
  })(),
  headers: { "Content-Type": "application/json" },
  withCredentials: true
});

if (DEV_MOCK_AUTH && import.meta.env.VITE_MOCK_JWT) {
  api.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${import.meta.env.VITE_MOCK_JWT}`;
    return config;
  });
  labsApi.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${import.meta.env.VITE_MOCK_JWT}`;
    return config;
  });
  financeApi.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${import.meta.env.VITE_MOCK_JWT}`;
    return config;
  });
}

/** Backend code meaning "valid session, but this user isn't entitled to Clinics". */
export const CLINICS_ACCESS_DENIED = "clinics_access_denied";

export const isClinicsAccessDenied = (err) =>
  err?.response?.status === 403 &&
  err?.response?.data?.error === CLINICS_ACCESS_DENIED;

const unauthorizedRedirect = (err) => {
  // A 403 clinics_access_denied is NOT a dead session — the token is valid, the
  // user just has no Clinics entitlement (e.g. an HMS user who opened
  // clinics.zenohosp.com carrying the shared *.zenohosp.com cookie). Send them
  // to the explicit "no access" page instead of the login flow, and above all
  // do not clear their session: it is still good for the apps they DO have.
  if (isClinicsAccessDenied(err)) {
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/unauthorized")
    ) {
      window.location.href = "/unauthorized?reason=no_clinics_access";
    }
    return Promise.reject(err);
  }

  if (err.response?.status === 401) {
    const url = err.config?.url || "";
    // Don't bounce on /auth/me — the AuthContext handles 401 there itself
    // (setUser(null) + isLoading=false). Don't bounce when already on /login
    // either — any 401 from a page mounted at the login route would just
    // reload /login, and providers like ReferenceDataProvider that fire
    // pre-auth would put the page into an infinite refresh loop.
    if (
      !url.includes("/auth/me") &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      window.location.href = "/login";
    }
  }
  return Promise.reject(err);
};

/**
 * Some API calls came back 200 OK but with the SSO login HTML in the body
 * because axios silently followed a 302 redirect from the backend. The
 * consuming page then tried .filter / .map / .reduce on a string and
 * crashed. Bounce to /login on any 2xx whose Content-Type is HTML so the
 * auth failure surfaces cleanly. The backend Spring Security fix
 * (HttpStatusEntryPoint on /api/**) is the proper cure; this is the
 * belt-and-braces guard for any other endpoint that misbehaves.
 */
const htmlBodyRedirect = (res) => {
  const ct = res?.headers?.["content-type"] || "";
  const url = res?.config?.url || "";
  if (
    ct.includes("text/html") &&
    !url.includes("/auth/me") &&
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login")
  ) {
    window.location.href = "/login";
    return Promise.reject(new Error("Auth required"));
  }
  return res;
};

api.interceptors.response.use(htmlBodyRedirect, unauthorizedRedirect);
labsApi.interceptors.response.use(htmlBodyRedirect, unauthorizedRedirect);
financeApi.interceptors.response.use(htmlBodyRedirect, unauthorizedRedirect);
const authApi = {
  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return data;
  },
  register: async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    return data;
  },
  me: async () => {
    const { data } = await api.get("/auth/me");
    return data;
  }
};
const directoryLogout = () => axios.post(`${DIRECTORY_API_URL}/api/auth/logout`, {}, { withCredentials: true });

// Cross-app reads. Plain axios rather than the `api` instance on purpose: a
// 401/403 from a sibling service must not run HMS's unauthorizedRedirect and
// bounce the user to /login. Callers swallow errors and render without the
// enrichment instead.
//
// Directory is present in every deployment (it's the identity provider), so
// check-in state read from it always works. People/HR is an optional purchase —
// anything sourced from it has to degrade to absent.
const PEOPLE_API_URL = import.meta.env.VITE_PEOPLE_API_URL || "https://api-people.zenohosp.com";

const directoryApi = {
  /**
   * Today's presence for the caller's own hospital (scoped by their token, not
   * a parameter). Returns { enabled, rows } where rows are
   * [{ userId, presence: CHECKED_IN|CHECKED_OUT, checkInAt, checkOutAt }] and
   * anyone absent from rows hasn't checked in.
   *
   * `enabled: false` means the hospital has no People/HR app, so no biometric
   * device reports attendance and there is nothing to show — distinct from an
   * empty roster, which just means nobody has arrived yet.
   */
  presence: async () => {
    const { data } = await axios.get(`${DIRECTORY_API_URL}/api/attendance/presence`, {
      withCredentials: true,
    });
    const payload = data?.data ?? data ?? {};
    return { enabled: payload.enabled === true, rows: payload.rows ?? [] };
  },
};

const peopleApi = {
  /**
   * Employees on approved leave today, as a Set of user ids. Optional: hospitals
   * without the People app have no leave workflow at all, so an unreachable or
   * forbidden People simply means no leave badges.
   */
  onLeaveToday: async (hospitalId) => {
    const { data } = await axios.get(`${PEOPLE_API_URL}/api/attendance/presence`, {
      params: { hospitalId },
      withCredentials: true,
    });
    return (data ?? []).filter((r) => r.presence === "LEAVE");
  },
};
const patientApi = {
  list: async (hospitalId) => {
    const { data } = await api.get(`/patients?hospitalId=${hospitalId}`);
    return data;
  },
  get: async (id, hospitalId) => {
    const { data } = await api.get(`/patients/${id}?hospitalId=${hospitalId}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/patients", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/patients/${id}`, payload);
    return data;
  },
  delete: (id) => api.delete(`/patients/${id}`),
  search: async (hospitalId, q) => {
    const res = await api.get("/patients/search", { params: { hospitalId, q } });
    return res.data;
  },
  listPaginated: (hospitalId, page = 0, size = 8, search = "") =>
    api.get(`/patients/paginated`, {
      params: { hospitalId, page, size, search }
    }).then(res => res.data),
};
const recordApi = {
  // Pass an admissionId to scope to a single admission's full clinical
  // course (consultations, prescriptions, lab results, surgery notes —
  // the discharge summary's primary input); omit it for the patient's
  // entire record history across all visits.
  list: async (patientId, hospitalId, admissionId) => {
    const params = { hospitalId };
    if (admissionId) params.admissionId = admissionId;
    const { data } = await api.get(`/records/patient/${patientId}`, { params });
    return data;
  },
  listByUser: async (userId, hospitalId) => {
    const { data } = await api.get(`/records/by-user?userId=${userId}&hospitalId=${hospitalId}`);
    return data;
  },
  // Pass an admissionId to scope to a single admission's prescriptions (IPD use case);
  // omit it to get the patient's entire prescription history across all visits.
  listPrescriptions: async (patientId, hospitalId, admissionId) => {
    const params = { hospitalId };
    if (admissionId) params.admissionId = admissionId;
    const { data } = await api.get(`/records/patient/${patientId}/prescriptions`, { params });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/records", payload);
    return data;
  },
  // Backs the print view — returns every record tied to one
  // appointment (typically a single CONSULTATION/PRESCRIPTION row,
  // sometimes a follow-up amendment), newest first.
  getByAppointment: async (appointmentId, hospitalId) => {
    const { data } = await api.get(`/records/by-appointment/${appointmentId}`, { params: { hospitalId } });
    return data;
  },
};
const staffApi = {
  list: async (hospitalId) => {
    const { data } = await api.get(`/users?hospitalId=${hospitalId}`);
    return data;
  },
  get: async (id) => {
    const { data } = await api.get(`/users/${id}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/users", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/users/${id}`, payload);
    return data;
  },
  deactivate: async (id) => {
    await api.patch(`/users/${id}/deactivate`);
  },
  activate: async (id) => {
    await api.patch(`/users/${id}/activate`);
  }
};
const doctorsApi = {
  list: async (hospitalId) => {
    const { data } = await api.get(`/doctors?hospitalId=${hospitalId}`);
    return data;
  },
  get: async (id) => {
    const { data } = await api.get(`/doctors/${id}`);
    return data;
  },
  getByUserId: async (userId) => {
    const { data } = await api.get(`/doctors/user/${userId}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/doctors", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/doctors/${id}`, payload);
    return data;
  },
  delete: async (id) => {
    await api.delete(`/doctors/${id}`);
  },
  getAvailability: async (id) => {
    const { data } = await api.get(`/doctors/${id}/availability`);
    return data;
  },
  saveAvailability: async (id, payload) => {
    const { data } = await api.post(`/doctors/${id}/availability`, payload);
    return data;
  },
  deleteAvailability: async (doctorId, slotId) => {
    await api.delete(`/doctors/${doctorId}/availability/${slotId}`);
  },
};
const pricingApi = {
  getHospitalPriceLists: async (hospitalId) => {
    const { data } = await api.get(`/pricing/hospital/${hospitalId}`);
    return data;
  },
  getPriceListItems: async (priceListId) => {
    const { data } = await api.get(`/pricing/items/list/${priceListId}`);
    return data;
  }
};
const appointmentsApi = {
  listPaginated: async (hospitalId, params) => {
    const { data } = await api.get("/appointments/paginated", {
      params: { hospitalId, ...params }
    });
    return data;
  },
  getByHospital: async (hospitalId, date) => {
    const url = date ? `/appointments/hospital/${hospitalId}?date=${date}` : `/appointments/hospital/${hospitalId}`;
    const { data } = await api.get(url);
    return data;
  },
  getByDoctor: async (doctorId, date) => {
    const { data } = await api.get(`/appointments/doctor/${doctorId}?date=${date}`);
    return data;
  },
  getByPatient: async (patientId) => {
    const { data } = await api.get(`/appointments/patient/${patientId}`);
    return data;
  },
  getPastDoctors: async (patientId, hospitalId) => {
    const { data } = await api.get(`/appointments/patient/${patientId}/past-doctors`, { params: { hospitalId } });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/appointments", payload);
    return data;
  },
  updateStatus: async (id, status, cancelledReason, refundMode, refundBankAccountId) => {
    const { data } = await api.put(`/appointments/${id}/status`, { status, cancelledReason, refundMode, refundBankAccountId });
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/appointments/${id}`, payload);
    return data;
  },
  // Single-appointment hydration used by the print-consultation page,
  // which opens in a new tab and only knows the id from the URL.
  getById: async (id) => {
    const { data } = await api.get(`/appointments/${id}`);
    return data;
  },
  refreshTokens: async (hospitalId) => {
    const { data } = await api.post(`/appointments/refresh-tokens`, null, { params: { hospitalId } });
    return data;
  }
};
const specializationApi = {
  list: async (hospitalId) => {
    const { data } = await api.get(`/specializations?hospitalId=${hospitalId}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/specializations", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/specializations/${id}`, payload);
    return data;
  },
  delete: async (id) => {
    await api.delete(`/specializations/${id}`);
  }
};
const patientServicesApi = {
  list: async (hospitalId) => {
    const { data } = await api.get(`/patient-services?hospitalId=${hospitalId}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/patient-services", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/patient-services/${id}`, payload);
    return data;
  },
  delete: async (id) => {
    await api.delete(`/patient-services/${id}`);
  },
  toggleStatus: async (id) => {
    await api.patch(`/patient-services/${id}/toggle-status`);
  }
};

const gstRateApi = {
  list: async (hospitalId, activeOnly = false) => {
    const { data } = await api.get("/gst-rates", { params: { hospitalId, activeOnly } });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/gst-rates", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/gst-rates/${id}`, payload);
    return data;
  },
  toggle: async (id) => {
    const { data } = await api.patch(`/gst-rates/${id}/toggle`);
    return data;
  },
  setDefault: async (id) => {
    const { data } = await api.patch(`/gst-rates/${id}/set-default`);
    return data;
  },
  delete: async (id) => {
    await api.delete(`/gst-rates/${id}`);
  }
};

const hospitalServiceApi = {
  list: async (hospitalId) => {
    const { data } = await api.get(`/hospital-services?hospitalId=${hospitalId}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/hospital-services", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/hospital-services/${id}`, payload);
    return data;
  },
  delete: async (id) => {
    await api.delete(`/hospital-services/${id}`);
  },
  toggleStatus: async (id) => {
    await api.patch(`/hospital-services/${id}/toggle-status`);
  }
};
const bedApi = {
  getByRoom: async (roomId, hospitalId) => {
    const { data } = await api.get(`/rooms/${roomId}/beds`, { params: { hospitalId } });
    return data;
  },
  freeBed: async (bedId, hospitalId) => {
    const { data } = await api.post(`/rooms/beds/${bedId}/free`, null, { params: { hospitalId } });
    return data;
  },
  getAvailable: async (hospitalId) => {
    const { data } = await api.get(`/rooms/beds/available`, { params: { hospitalId } });
    return data;
  },
  getAll: async (hospitalId) => {
    const { data } = await api.get(`/rooms/beds/all`, { params: { hospitalId } });
    return data;
  },
};
const roomLogsApi = {
  getHospitalLogs: async (hospitalId, search) => {
    const params = { hospitalId };
    if (search) params.search = search;
    const { data } = await api.get("/rooms/logs", { params });
    return data;
  },
  getRoomLogs: async (roomId, hospitalId) => {
    const { data } = await api.get(`/rooms/${roomId}/logs`, { params: { hospitalId } });
    return data;
  }
};
// Radiology now served by labs (api-labs.zenohosp.com / labsApi instance).
// Contract is byte-identical to the previous HMS endpoint — only the host
// changes.
const radiologyApi = {
  list: async (hospitalId, status) => {
    const params = { hospitalId };
    if (status) params.status = status;
    const { data } = await labsApi.get("/radiology", { params });
    return data;
  },
  get: async (id) => {
    const { data } = await labsApi.get(`/radiology/${id}`);
    return data;
  },
  getByPatient: async (patientId) => {
    const { data } = await labsApi.get(`/radiology/patient/${patientId}`);
    return data;
  },
  getByAdmission: async (admissionId) => {
    const { data } = await labsApi.get(`/radiology/admission/${admissionId}`);
    return data;
  },
  getStats: async (hospitalId) => {
    const { data } = await labsApi.get("/radiology/stats", { params: { hospitalId } });
    return data;
  },
  create: async (payload) => {
    const { data } = await labsApi.post("/radiology", payload);
    return data;
  },
  markScanned: async (id) => {
    const { data } = await labsApi.patch(`/radiology/${id}/scan`);
    return data;
  },
  generateReport: async (id, findings, observation) => {
    const { data } = await labsApi.patch(`/radiology/${id}/report`, { findings, observation });
    return data;
  }
};
// shiftsApi removed — HR ownership has moved to the People app
// (https://people.zenohosp.com). Use the People backend's /api/shifts surface
// if a future HMS feature needs to read or write the staff_shifts table.
const invoiceApi = {
  listOpdPaginated: async (hospitalId, page = 0, size = 10, status = 'ALL', search = '') => {
    const { data } = await api.get("/invoices/opd/paginated", {
      params: { hospitalId, page, size, status, search }
    });
    return data;
  },
  listIpdPaginated: async (hospitalId, page = 0, size = 10, status = 'ALL', search = '') => {
    const { data } = await api.get("/invoices/ipd/paginated", {
      params: { hospitalId, page, size, status, search }
    });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/invoices", payload);
    return data;
  },
  getByHospital: async (hospitalId) => {
    const { data } = await api.get(`/invoices/hospital/${hospitalId}`);
    return data;
  },
  get: async (id) => {
    const { data } = await api.get(`/invoices/${id}`);
    return data;
  },
  getByPatient: async (patientId) => {
    const { data } = await api.get(`/billing/patient/${patientId}/invoices`);
    return data;
  },
  getByAppointment: async (appointmentId) => {
    const { data } = await api.get(`/invoices/appointment/${appointmentId}`);
    return data;
  },
  getSmartSuggestions: async (patientId, admissionId) => {
    const params = { patientId }
    if (admissionId) params.admissionId = admissionId
    const { data } = await api.get("/billing/smart-suggestions", { params })
    return data;
  },
  markAsPaid: async (invoiceId, bankAccountId) => {
    const { data } = await api.patch(`/billing/invoices/${invoiceId}/pay`, { bankAccountId });
    return data;
  },
  getDetail: async (id) => {
    const { data } = await api.get(`/billing/invoices/${id}/detail`);
    return data;
  },
  waiveItem: async (invoiceId, itemId, waiverAmount, waiverReason) => {
    const { data } = await api.patch(`/billing/invoices/${invoiceId}/items/${itemId}/waive`, { waiverAmount, waiverReason });
    return data;
  },
  getAdmissionInvoice: async (admissionId) => {
    const { data } = await api.get(`/billing/admissions/${admissionId}/invoice`);
    return data;
  },
  finalizeIPD: async (invoiceId, payload) => {
    const { data } = await api.put(`/billing/invoices/${invoiceId}/finalize`, payload);
    return data;
  },
  collectAndSave: async (invoiceId, payload) => {
    const { data } = await api.post(`/billing/invoices/${invoiceId}/collect`, payload);
    return data;
  },
  updateEstimate: async (invoiceId, total) => {
    await api.patch(`/billing/invoices/${invoiceId}/estimate`, { total });
  },
  getPatientInvoices: async (patientId) => {
    const { data } = await api.get(`/billing/patient/${patientId}/invoices`);
    return data;
  },
  collectPayment: async (invoiceId, payload) => {
    const { data } = await api.post(`/billing/invoices/${invoiceId}/payments`, payload);
    return data;
  },
};
// Insurance/TPA claims raised on invoices. Read-only from HMS billing — the
// lifecycle (submit / approve / deny / settle) is worked in the Finance app.
// Returns { openCount, ..., claims: [{ invoiceId, status, payerName, ... }] }.
const claimsApi = {
  list: async (hospitalId, status = 'ALL') => {
    const { data } = await api.get('/finance/claims', { params: { hospitalId, status } });
    return data;
  },
};
// Bank accounts live in the shared `bank_accounts` table, which the finance
// service maps too — an account added here is the same row the finance app's
// day book and reconciliation read. Managed through this app's own backend
// rather than /finance-api so account management keeps working when the
// finance service is down, and so the hospital-scoping guard is applied by the
// service that owns the caller's session.
const bankApi = {
  // types: optional array or comma-string of accountType filters (e.g. ["SAVINGS","CURRENT"] or "CASH").
  // Omitted → returns all accounts for the hospital.
  list: async (hospitalId, types) => {
    const params = { hospitalId };
    if (types) {
      params.type = Array.isArray(types) ? types.join(",") : types;
    }
    const { data } = await api.get("/bank-accounts", { params });
    return data;
  },
  create: async (hospitalId, payload) => {
    const { data } = await api.post("/bank-accounts", payload, { params: { hospitalId } });
    return data;
  },
  update: async (hospitalId, id, payload) => {
    const { data } = await api.put(`/bank-accounts/${id}`, payload, { params: { hospitalId } });
    return data;
  },
  remove: async (hospitalId, id) => {
    await api.delete(`/bank-accounts/${id}`, { params: { hospitalId } });
  }
};

const departmentApi = {
  list: async (hospitalId, activeOnly = false) => {
    const { data } = await api.get("/departments", { params: { hospitalId, activeOnly } });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/departments", payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/departments/${id}`, payload);
    return data;
  },
  toggle: async (id) => {
    const { data } = await api.patch(`/departments/${id}/toggle`);
    return data;
  }
};

const designationApi = {
  list: async (hospitalId, activeOnly = false, departmentId = null) => {
    const params = { hospitalId, activeOnly };
    if (departmentId) params.departmentId = departmentId;
    const { data } = await api.get("/designations", { params });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/designations", payload);
    return data;
  },
  toggle: async (id) => {
    const { data } = await api.patch(`/designations/${id}/toggle`);
    return data;
  }
};

const admissionApi = {
  list: async (hospitalId, all = false) => {
    const { data } = await api.get("/admissions", { params: { hospitalId, all } });
    return data;
  },
  listPaginated: async (hospitalId, status = "ADMITTED", search = "", page = 0, size = 10, filters = {}) => {
    const { data } = await api.get("/admissions/paginated", { params: { hospitalId, status, search, page, size, ...filters } });
    return data;
  },
  get: async (id) => {
    const { data } = await api.get(`/admissions/${id}`);
    return data;
  },
  byPatient: async (patientId) => {
    const { data } = await api.get(`/admissions/patient/${patientId}`);
    return data;
  },
  admit: async (payload) => {
    const { data } = await api.post("/admissions", payload);
    return data;
  },
  assignRoom: async (admissionId, roomId) => {
    const { data } = await api.patch(`/admissions/${admissionId}/assign-room`, { roomId });
    return data;
  },
  discharge: async (admissionId, payload) => {
    const { data } = await api.patch(`/admissions/${admissionId}/discharge`, payload);
    return data;
  },
  moveToOT: async (admissionId, roomId, doctorId, otBookingId) => {
    const { data } = await api.patch(`/admissions/${admissionId}/move-to-ot`, { roomId, doctorId, otBookingId });
    return data;
  },
  returnFromOT: async (admissionId, postOtRoomId) => {
    const { data } = await api.patch(`/admissions/${admissionId}/return-from-ot`, postOtRoomId ? { postOtRoomId } : {});
    return data;
  },
  returnToWard: async (admissionId) => {
    const { data } = await api.patch(`/admissions/${admissionId}/return-to-ward`);
    return data;
  },
  getPostOtRooms: async (hospitalId) => {
    const { data } = await api.get('/rooms', { params: { hospitalId } });
    return data.filter(r => r.roomType === 'POST_OT' && r.status === 'AVAILABLE');
  },
  updateAttender: async (admissionId, payload) => {
    const { data } = await api.put(`/admissions/${admissionId}/attender`, payload);
    return data;
  }
};

const roomApi = {
  list: async (hospitalId) => {
    const { data } = await api.get("/rooms", { params: { hospitalId } });
    return data;
  }
};

const infrastructureApi = {
  get: async (hospitalId, includeInactive = false) => {
    const { data } = await api.get("/ipd/infrastructure", { params: { hospitalId, includeInactive } });
    return data;
  },
  save: async (hospitalId, buildings) => {
    const { data } = await api.post("/ipd/infrastructure", buildings, { params: { hospitalId } });
    return data;
  },
  validateRemoval: async (payload) => {
    const { data } = await api.post(`/ipd/infrastructure/validate-removal`, payload);
    return data;
  },
};

const roomTypeApi = {
  getAll: async (hospitalId) => {
    const { data } = await api.get("/settings/room-types", { params: { hospitalId } });
    return data;
  },
  create: async (hospitalId, payload) => {
    const { data } = await api.post("/settings/room-types", payload, { params: { hospitalId } });
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/settings/room-types/${id}`, payload);
    return data;
  },
  delete: async (id) => {
    await api.delete(`/settings/room-types/${id}`);
  },
};

const assetApi = {
  getByRoom: async (hospitalId, roomId) => {
    const { data } = await api.get(`/assets/room/${roomId}`, { params: { hospitalId } });
    return data;
  },
  getAvailable: async (hospitalId, q) => {
    const { data } = await api.get("/assets/available", { params: { hospitalId, ...(q ? { q } : {}) } });
    return data;
  },
  assignToRoom: async (assetId, roomId, hospitalId) => {
    const { data } = await api.patch(`/assets/${assetId}/assign-room`, { roomId, hospitalId });
    return data;
  },
  unassignFromRoom: async (assetId) => {
    const { data } = await api.patch(`/assets/${assetId}/unassign-room`);
    return data;
  },
};

const ambulanceApi = {
  getTypes: async (hospitalId) => {
    const { data } = await api.get("/ambulance/types", { params: { hospitalId } });
    return data;
  },
  createType: async (hospitalId, payload) => {
    const { data } = await api.post("/ambulance/types", payload, { params: { hospitalId } });
    return data;
  },
  deleteType: async (id) => api.delete(`/ambulance/types/${id}`),

  getBookings: async (hospitalId, params = {}) => {
    const { data } = await api.get("/ambulance/bookings", { params: { hospitalId, ...params } });
    return data;
  },
  createBooking: async (hospitalId, payload) => {
    const { data } = await api.post("/ambulance/bookings", payload, { params: { hospitalId } });
    return data;
  },
  updateStatus: async (id, payload) => {
    const { data } = await api.patch(`/ambulance/bookings/${id}/status`, payload);
    return data;
  },
  updateBooking: async (id, payload) => {
    const { data } = await api.put(`/ambulance/bookings/${id}`, payload);
    return data;
  },
  deleteBooking: async (id) => api.delete(`/ambulance/bookings/${id}`),

  getStats: async (hospitalId) => {
    const { data } = await api.get("/ambulance/stats", { params: { hospitalId } });
    return data;
  },

  getVehicles: async (hospitalId) => {
    const { data } = await api.get("/ambulance/vehicles", { params: { hospitalId } });
    return data;
  },
  getAvailableVehicles: async (hospitalId) => {
    const { data } = await api.get("/ambulance/vehicles/available", { params: { hospitalId } });
    return data;
  },
  createVehicle: async (hospitalId, payload) => {
    const { data } = await api.post("/ambulance/vehicles", payload, { params: { hospitalId } });
    return data;
  },
  updateVehicle: async (id, payload) => {
    const { data } = await api.put(`/ambulance/vehicles/${id}`, payload);
    return data;
  },
  updateVehicleStatus: async (id, status) => {
    const { data } = await api.patch(`/ambulance/vehicles/${id}/status`, { status });
    return data;
  },
  deleteVehicle: async (id) => api.delete(`/ambulance/vehicles/${id}`),

  getHospitalInfo: async (hospitalId) => {
    const { data } = await api.get("/ambulance/hospital-info", { params: { hospitalId } });
    return data;
  },

  getBookingsByPatient: async (hospitalId, patientId) => {
    const { data } = await api.get(`/ambulance/bookings/by-patient/${patientId}`, { params: { hospitalId } });
    return data;
  },
  markMergedToIpd: async (id) => {
    await api.patch(`/ambulance/${id}/merge-ipd`);
  },
};

const featureFlagsApi = {
  list: async (hospitalId) => {
    const { data } = await api.get("/settings/features", { params: { hospitalId } });
    return data;
  },
  set: async (hospitalId, key, enabled) => {
    const { data } = await api.put("/settings/features", { key, enabled }, { params: { hospitalId } });
    return data;
  },
};

// Health checkups served via HMS backend proxy to labs. The HMS frontend
// stays single-origin (hms.zenohosp.com/api/health-checkups/*); the proxy
// forwards every request to labs (api-labs.zenohosp.com/api/health-checkups/*)
// with JWT preserved. Contract is byte-identical to labs — the HMS proxy
// is transparent.
const checkupApi = {
  getPackages: async (hospitalId, activeOnly = false) => {
    const { data } = await api.get("/health-checkups/packages", { params: { hospitalId, activeOnly } });
    return data;
  },
  savePackage: async (hospitalId, payload) => {
    const { data } = await api.post("/health-checkups/packages", payload, { params: { hospitalId } });
    return data;
  },
  togglePackage: async (id) => api.patch(`/health-checkups/packages/${id}/toggle`),
  deletePackage: async (id) => api.delete(`/health-checkups/packages/${id}`),

  getBookings: async (hospitalId, params = {}) => {
    const { data } = await api.get("/health-checkups/bookings", { params: { hospitalId, ...params } });
    return data;
  },
  getBooking: async (id) => {
    const { data } = await api.get(`/health-checkups/bookings/${id}`);
    return data;
  },
  createBooking: async (hospitalId, payload) => {
    const { data } = await api.post("/health-checkups/bookings", payload, { params: { hospitalId } });
    return data;
  },
  updateStatus: async (id, status) => {
    const { data } = await api.patch(`/health-checkups/bookings/${id}/status`, { status });
    return data;
  },
  updateResult: async (bookingId, resultId, payload) => {
    const { data } = await api.patch(`/health-checkups/bookings/${bookingId}/results/${resultId}`, payload);
    return data;
  },
  saveDoctorNotes: async (bookingId, payload) => {
    const { data } = await api.patch(`/health-checkups/bookings/${bookingId}/doctor-notes`, payload);
    return data;
  },
  assignDoctor: async (bookingId, doctorId) => {
    const { data } = await api.patch(`/health-checkups/bookings/${bookingId}/doctor`, { doctorId: doctorId || null });
    return data;
  },
  getStats: async (hospitalId) => {
    const { data } = await api.get("/health-checkups/stats", { params: { hospitalId } });
    return data;
  },
};

const patientAdvanceApi = {
  // List all advances linked to a specific admission
  listForAdmission: async (admissionId) => {
    const { data } = await api.get(`/billing/admissions/${admissionId}/advances`);
    return data;
  },
  // Collect a room/admission advance at IPD admit time (Step 4)
  createForAdmission: async (admissionId, payload) => {
    const { data } = await api.post(`/billing/admissions/${admissionId}/advances`, payload);
    return data;
  },
};

const dashboardApi = {
  getSummary: async (hospitalId) => {
    const { data } = await api.get("/dashboard/summary", { params: { hospitalId } });
    return data;
  }
};

// Drug master read for the prescription picker. Backed by pharmacy_drug_master
// in the shared Supabase DB; HMS doesn't proxy through pharmacy backend.
const drugsApi = {
  search: async (hospitalId, q) => {
    const { data } = await api.get("/drugs/search", { params: { hospitalId, q: q || "" } });
    return data;
  }
};

// External lab / radiology / pathology results captured by front-desk or
// nursing staff at check-in (same flow as vitals). The structured-data
// shape the consultation Lab Tests tab reads from.
const externalResultsApi = {
  listForPatient: async (patientId, hospitalId, { category, from, to, page = 0, size = 50 } = {}) => {
    const params = { hospitalId, page, size };
    if (category) params.category = category;
    if (from) params.from = from;
    if (to) params.to = to;
    const { data } = await api.get(`/external-results/patient/${patientId}`, { params });
    return data;
  },
  // Visit-scoped fetch used by the consultation Lab Tests tab and the
  // print sheet — returns only the reports captured during this
  // specific appointment, not the patient's full history.
  listForAppointment: async (appointmentId, hospitalId) => {
    const { data } = await api.get(`/external-results/appointment/${appointmentId}`, {
      params: { hospitalId },
    });
    return data;
  },
  create: async (payload) => {
    const { data } = await api.post("/external-results", payload);
    return data;
  },
};

// Per-visit vitals captured by the nurse before the doctor starts the
// consultation. One row per appointment (UNIQUE) — PUT is upsert. The
// consultation modal hydrates from this on open so the doctor sees BP /
// SpO2 / HR / weight without a separate fetch.
const vitalsApi = {
  get: async (appointmentId) => {
    const res = await api.get(`/vitals/appointment/${appointmentId}`, {
      validateStatus: (s) => s === 200 || s === 204 || s === 404,
    });
    if (res.status === 200) return res.data;
    return null;
  },
  listForHospital: async (hospitalId) => {
    const { data } = await api.get("/vitals", { params: { hospitalId } });
    return data;
  },
  history: async (patientId, hospitalId) => {
    const { data } = await api.get(`/vitals/patient/${patientId}/history`, { params: { hospitalId } });
    return data;
  },
  upsert: async (appointmentId, payload) => {
    const { data } = await api.put(`/vitals/appointment/${appointmentId}`, payload);
    return data;
  },
};

// IPD vitals — many readings per admission, newest-first list.
const ipdVitalsApi = {
  list:   (admissionId) => api.get(`/ipd/vitals/admission/${admissionId}`).then((r) => r.data),
  create: (payload)     => api.post("/ipd/vitals", payload).then((r) => r.data),
};

const zemaRulesApi = {
  list: async (hospitalId) => {
    const { data } = await api.get("/zema-rules", { params: { hospitalId } });
    return data;
  }
};

// Blood Bank — donors, bag inventory, issuance, stats. Lookups (groups,
// components, statuses, donor types, source types) live as DB rows so the
// admin can extend them without a backend deploy.
const bloodBankApi = {
  listLookups: async (hospitalId, type) => {
    const { data } = await api.get("/blood-bank/lookups", { params: { hospitalId, type } });
    return data;
  },
  listDonors: async (hospitalId) => {
    const { data } = await api.get("/blood-bank/donors", { params: { hospitalId } });
    return data;
  },
  getDonor: async (id, hospitalId) => {
    const { data } = await api.get(`/blood-bank/donors/${id}`, { params: { hospitalId } });
    return data;
  },
  registerDonor: async (hospitalId, payload) => {
    const { data } = await api.post("/blood-bank/donors", payload, { params: { hospitalId } });
    return data;
  },
  updateDonor: async (id, hospitalId, payload) => {
    const { data } = await api.put(`/blood-bank/donors/${id}`, payload, { params: { hospitalId } });
    return data;
  },
  listUnits: async (hospitalId, params = {}) => {
    const { data } = await api.get("/blood-bank/units", { params: { hospitalId, ...params } });
    return data;
  },
  getUnit: async (id, hospitalId) => {
    const { data } = await api.get(`/blood-bank/units/${id}`, { params: { hospitalId } });
    return data;
  },
  registerUnit: async (hospitalId, payload) => {
    const { data } = await api.post("/blood-bank/units", payload, { params: { hospitalId } });
    return data;
  },
  getNextBagNumber: async (hospitalId) => {
    const { data } = await api.get("/blood-bank/units/next-bag-number", { params: { hospitalId } });
    return data.bagNumber;
  },
  updateStatus: async (id, hospitalId, statusCode) => {
    const { data } = await api.patch(`/blood-bank/units/${id}/status`, { statusCode }, { params: { hospitalId } });
    return data;
  },
  issueUnit: async (id, hospitalId, payload) => {
    const { data } = await api.post(`/blood-bank/units/${id}/issue`, payload, { params: { hospitalId } });
    return data;
  },
  recordReplacement: async (id, hospitalId) => {
    const { data } = await api.patch(`/blood-bank/units/${id}/replacements`, {}, { params: { hospitalId } });
    return data;
  },
  getStats: async (hospitalId) => {
    const { data } = await api.get("/blood-bank/stats", { params: { hospitalId } });
    return data;
  },
};

// Bio-medical waste — BMWM Rules 2016 daily category-wise waste logging and
// handover-to-vendor manifests. Lookups (waste categories, generation
// points) live as DB rows, same convention as Blood Bank.
const bioMedicalWasteApi = {
  listLookups: async (hospitalId, type) => {
    const { data } = await api.get("/biomedical-waste/lookups", { params: { hospitalId, type } });
    return data;
  },
  listLogs: async (hospitalId, params = {}) => {
    const { data } = await api.get("/biomedical-waste/logs", { params: { hospitalId, ...params } });
    return data;
  },
  createLog: async (hospitalId, payload) => {
    const { data } = await api.post("/biomedical-waste/logs", payload, { params: { hospitalId } });
    return data;
  },
  updateLog: async (id, hospitalId, payload) => {
    const { data } = await api.put(`/biomedical-waste/logs/${id}`, payload, { params: { hospitalId } });
    return data;
  },
  deleteLog: async (id, hospitalId) => {
    await api.delete(`/biomedical-waste/logs/${id}`, { params: { hospitalId } });
  },
  getStats: async (hospitalId) => {
    const { data } = await api.get("/biomedical-waste/stats", { params: { hospitalId } });
    return data;
  },
  listHandovers: async (hospitalId, params = {}) => {
    const { data } = await api.get("/biomedical-waste/handovers", { params: { hospitalId, ...params } });
    return data;
  },
  createHandover: async (hospitalId, payload) => {
    const { data } = await api.post("/biomedical-waste/handovers", payload, { params: { hospitalId } });
    return data;
  },
  getHandover: async (id, hospitalId) => {
    const { data } = await api.get(`/biomedical-waste/handovers/${id}`, { params: { hospitalId } });
    return data;
  },
};

// IPD Medication Administration Record — order cards with embedded admin log.
const marApi = {
  list:      (admissionId)      => api.get(`/ipd/mar/admission/${admissionId}`).then((r) => r.data),
  create:    (payload)          => api.post("/ipd/mar", payload).then((r) => r.data),
  stopOrder: (itemId, reason)   => api.patch(`/ipd/prescription-items/${itemId}/stop`, { reason }).then((r) => r.data),

  /**
   * Initiate a ward return of unused dispensed units. The backend optimistically
   * bumps returned_qty, recomputes dispense_status, and (when stopOrder=true)
   * flips the order to STOPPED in the same transaction. Pharmacy then polls and
   * verifies the physical units at the counter.
   *
   * Idempotency: clientRequestId is generated client-side via crypto.randomUUID()
   * so a network retry returns the same return-request row instead of bumping twice.
   * Always generate it inside this function — not on form mount — so an explicit
   * second submission of an already-failed request gets a fresh id.
   */
  initiateReturn: (itemId, body) =>
    api.post(`/ipd/prescription-items/${itemId}/return`, {
      ...body,
      clientRequestId:
        body?.clientRequestId ??
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    }).then((r) => r.data),
};

const allergyApi = {
  list:   (patientId, hospitalId) => api.get(`/patients/${patientId}/allergies`, { params: { hospitalId } }).then((r) => r.data),
  add:    (patientId, payload)    => api.post(`/patients/${patientId}/allergies`, payload).then((r) => r.data),
  remove: (patientId, allergyId)  => api.delete(`/patients/${patientId}/allergies/${allergyId}`).then((r) => r.data),
};

const ioApi = {
  list:   (admissionId)          => api.get(`/ipd/fluid/${admissionId}`).then((r) => r.data),
  add:    (admissionId, payload) => api.post(`/ipd/fluid/${admissionId}`, payload).then((r) => r.data),
  remove: (admissionId, entryId) => api.delete(`/ipd/fluid/${admissionId}/${entryId}`).then((r) => r.data),
};

// Lab orders are now owned by the labs service (api-labs.zenohosp.com). Same
// shared sso_token cookie, same hospital scoping — only the host moves. The
// admissionId is the implicit scope for read (`/lab/admission/{id}`); write
// endpoints take just the order id so collect/report/cancel drop the
// admission segment from the path.
const labOrderApi = {
  list:    (admissionId)                              => labsApi.get(`/lab/admission/${admissionId}`).then((r) => r.data),
  // Alias of list — matches radiologyApi.getByAdmission's naming so cross-
  // module callers (IPD billing, investigation views) can use the same
  // method name regardless of kind. Missing this alias used to throw a
  // sync TypeError inside Promise.all and silently kill the entire IPD
  // billing estimation block (room, consultation, radiology, lab, meds
  // all disappeared from the right pane).
  getByAdmission: (admissionId)                       => labsApi.get(`/lab/admission/${admissionId}`).then((r) => r.data),
  getByPatient: (patientId)                           => labsApi.get(`/lab/patient/${patientId}`).then((r) => r.data),
  create:  (payload)                                  => labsApi.post(`/lab`, payload).then((r) => r.data),
  // Lifecycle transitions (collect / report / cancel) are owned by labs.zenohosp.com
  // and no longer driven from the HMS UI — the investigations tab is read-only.
  // Kept here for programmatic flows / tests and so a revert needs no code change.
  collect: (orderId)                                  => labsApi.patch(`/lab/${orderId}/collect`).then((r) => r.data),
  report:  (orderId, { findings, observation })       => labsApi.patch(`/lab/${orderId}/report`, { findings, observation }).then((r) => r.data),
  cancel:  (orderId)                                  => labsApi.delete(`/lab/${orderId}`).then((r) => r.data),
};

// Unified lab + radiology read for IPD Detail Pane and Consultation View.
// Returns InvestigationSummaryDTO[] with `kind: "LAB" | "RADIOLOGY"`, sorted
// by createdAt DESC. Read-only — writes still go through labOrderApi /
// radiologyApi for the kind-specific endpoint.
const investigationsApi = {
  byAdmission: (admissionId) => labsApi.get(`/investigations/admission/${admissionId}`).then((r) => r.data),
  byPatient:   (patientId)   => labsApi.get(`/investigations/patient/${patientId}`).then((r) => r.data),
  // Atomic multi-test requisition (labs Phase 10 / V17). Sends the whole queue
  // as one group; labs routes each test by discipline, creates all-or-nothing,
  // and returns { requisitionNumber, labOrderIds, radiologyOrderIds }. The
  // Idempotency-Key header lets a retried submit dedupe server-side (no
  // duplicate orders / duplicate bills). Each order still bills individually.
  createBatch: (payload, idempotencyKey) =>
    labsApi.post(`/investigations/batch`, payload,
      idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined
    ).then((r) => r.data),
};

// Labs catalogue read. Direct labsApi call so the response stays off the
// HMS Render edge — Phase-10 ran into a Render-side 502 on the in-house
// /api/lab-services proxy for the 45 KB catalogue payload while HMS Spring
// Boot was correctly returning 200 OK. Same SSO cookie, same VITE_LABS_API_URL.
const labCatalogApi = {
  list: async ({ active } = {}) => {
    const params = {};
    if (active !== undefined) params.active = active;
    const { data } = await labsApi.get("/lab-services", { params });
    return data;
  },
};

const nursingTaskApi = {
  list:     (admissionId)                  => api.get(`/ipd/nursing-tasks/${admissionId}`).then((r) => r.data),
  create:   (admissionId, payload)         => api.post(`/ipd/nursing-tasks/${admissionId}`, payload).then((r) => r.data),
  complete: (admissionId, taskId)          => api.patch(`/ipd/nursing-tasks/${admissionId}/${taskId}/complete`).then((r) => r.data),
  skip:     (admissionId, taskId, payload) => api.patch(`/ipd/nursing-tasks/${admissionId}/${taskId}/skip`, payload).then((r) => r.data),
  remove:   (admissionId, taskId)          => api.delete(`/ipd/nursing-tasks/${admissionId}/${taskId}`).then((r) => r.data),
};

const referralApi = {
  list:     (admissionId)                      => api.get(`/ipd/referrals/${admissionId}`).then((r) => r.data),
  create:   (admissionId, payload)             => api.post(`/ipd/referrals/${admissionId}`, payload).then((r) => r.data),
  accept:   (admissionId, referralId, payload) => api.patch(`/ipd/referrals/${admissionId}/${referralId}/accept`, payload).then((r) => r.data),
  complete: (admissionId, referralId, payload) => api.patch(`/ipd/referrals/${admissionId}/${referralId}/complete`, payload).then((r) => r.data),
  cancel:   (admissionId, referralId, payload) => api.patch(`/ipd/referrals/${admissionId}/${referralId}/cancel`, payload).then((r) => r.data),
};

// Autosave for the in-flight consultation modal. One row per appointment.
// get() resolves to null when the appointment has no draft yet — the modal
// uses that to decide between hydrating from autosave or seeding from the
// appointment record.
const consultationDraftsApi = {
  get: async (appointmentId) => {
    const res = await api.get(`/consultation-drafts/by-appointment/${appointmentId}`, {
      validateStatus: (s) => s === 200 || s === 204 || s === 404,
    });
    if (res.status === 200) return res.data;
    return null;
  },
  listForHospital: async (hospitalId) => {
    const { data } = await api.get("/consultation-drafts", { params: { hospitalId } });
    return data;
  },
  upsert: async (appointmentId, payload) => {
    const { data } = await api.put(`/consultation-drafts/by-appointment/${appointmentId}`, payload);
    return data;
  },
  remove: async (appointmentId) => {
    await api.delete(`/consultation-drafts/by-appointment/${appointmentId}`);
  },
};

// ══════════════════════════════════════════════════════════════════════════
//  Labs — hospital-wide queues, result entry, catalog
//
//  The existing labOrderApi/radiologyApi above are patient- and admission-
//  scoped: they answer "what was ordered for this patient". These are the
//  hospital-wide equivalents that back the Labs section's own pages — the
//  queues a technician works through. Endpoint shapes mirror the labs app's
//  own client so both stay in step.
// ══════════════════════════════════════════════════════════════════════════

const labQueueApi = {
  /** Whole-hospital lab orders, optionally narrowed to one status. */
  list: async (hospitalId, status) => {
    const params = { hospitalId };
    if (status && status !== "ALL") params.status = status;
    const { data } = await labsApi.get("/lab", { params });
    return Array.isArray(data) ? data : (data?.content ?? []);
  },
  get: (id) => labsApi.get(`/lab/${id}`).then((r) => r.data),
  stats: (hospitalId) => labsApi.get("/lab/stats", { params: { hospitalId } }).then((r) => r.data),

  // Lifecycle. The labs service owns the state machine; these just drive it:
  //   PENDING_COLLECTION → (collect) → AWAITING_REPORT → (receive)
  //   → (start) → IN_PROGRESS → (report) → (complete) → REPORT_GENERATED
  markCollected: (id) => labsApi.patch(`/lab/${id}/collect`).then((r) => r.data),
  markReceived: (id) => labsApi.patch(`/lab/${id}/receive`).then((r) => r.data),
  markStarted: (id) => labsApi.patch(`/lab/${id}/start`).then((r) => r.data),
  generateReport: (id, findings, observation) =>
    labsApi.patch(`/lab/${id}/report`, { findings, observation }).then((r) => r.data),
  markCompleted: (id) => labsApi.patch(`/lab/${id}/complete`).then((r) => r.data),
  cancelOrder: (id, reason) =>
    labsApi.patch(`/lab/${id}/cancel`, reason ? { reason } : {}).then((r) => r.data),
};

const collectionApi = {
  /** Phlebotomy worklist — patients with samples still to be drawn. */
  queue: () => labsApi.get("/collection/queue").then((r) => r.data),
  forPatient: (patientId) => labsApi.get(`/collection/queue/${patientId}`).then((r) => r.data),
  /** Draw several orders for one patient in a single visit. */
  bulkCollect: (payload) => labsApi.post("/collection/bulk-collect", payload).then((r) => r.data),
  stats: () => labsApi.get("/collection/stats").then((r) => r.data),
};

const labResultApi = {
  listForOrder: (labOrderId) => labsApi.get(`/lab/${labOrderId}/results`).then((r) => r.data),
  create: (labOrderId, payload) =>
    labsApi.post(`/lab/${labOrderId}/results`, payload).then((r) => r.data),
  /** Save a whole analyte panel at once — the normal path for result entry. */
  createBulk: (labOrderId, results) =>
    labsApi.post(`/lab/${labOrderId}/results/bulk`, { results }).then((r) => r.data),
  verify: (id, payload = {}) => labsApi.patch(`/results/${id}/verify`, payload).then((r) => r.data),
  authorise: (id, payload = {}) => labsApi.patch(`/results/${id}/authorise`, payload).then((r) => r.data),
};

const labServiceApi = {
  /** Test catalog — what this clinic offers, with prices. */
  catalog: (params) => labsApi.get("/lab-services/catalog", { params }).then((r) => r.data),
  search: (q) => labsApi.get("/lab-services/search", { params: { q } }).then((r) => r.data),
  /** Reference ranges drive the high/low flags shown during result entry. */
  ranges: (id) => labsApi.get(`/lab-services/${id}/ranges`).then((r) => r.data),
};

const radiologyQueueApi = {
  list: async (hospitalId, status) => {
    const params = { hospitalId };
    if (status && status !== "ALL") params.status = status;
    const { data } = await labsApi.get("/radiology", { params });
    return Array.isArray(data) ? data : (data?.content ?? []);
  },
  get: (id) => labsApi.get(`/radiology/${id}`).then((r) => r.data),
  stats: (hospitalId) => labsApi.get("/radiology/stats", { params: { hospitalId } }).then((r) => r.data),
  markScanned: (id) => labsApi.patch(`/radiology/${id}/scan`).then((r) => r.data),
  markStarted: (id) => labsApi.patch(`/radiology/${id}/start`).then((r) => r.data),
  generateReport: (id, findings, impression) =>
    labsApi.patch(`/radiology/${id}/report`, { findings, impression }).then((r) => r.data),
  markCompleted: (id) => labsApi.patch(`/radiology/${id}/complete`).then((r) => r.data),
  cancelOrder: (id, reason) =>
    labsApi.patch(`/radiology/${id}/cancel`, reason ? { reason } : {}).then((r) => r.data),
};

// ══════════════════════════════════════════════════════════════════════════
//  Finance — day book, expenses, GST
//
//  Receivables are deliberately NOT here: they are derived from this app's own
//  invoices (see financeSelectors.buildReceivables), so asking the finance
//  service for them would round-trip to a service that reads the same rows.
// ══════════════════════════════════════════════════════════════════════════

const financeReportApi = {
  /** Cash in/out for one day, with opening and closing balances. */
  dayBook: (date) => financeApi.get("/finance/reports/day-book", { params: { date } }).then((r) => r.data),
  summary: (from, to) => financeApi.get("/finance/reports/summary", { params: { from, to } }).then((r) => r.data),
  daily: (from, to) => financeApi.get("/finance/reports/daily", { params: { from, to } }).then((r) => r.data),
  expenseCategories: (from, to) =>
    financeApi.get("/finance/reports/expense-categories", { params: { from, to } }).then((r) => r.data),
  /** Input-tax register (purchases). Inclusive dates. */
  gst: (from, to) => financeApi.get("/finance/reports/tax/gst", { params: { from, to } }).then((r) => r.data),
  /** Output-GST (sales) register — the GSTR-1 prep view. */
  outputGst: (from, to) =>
    financeApi.get("/finance/reports/tax/output-gst", { params: { from, to } }).then((r) => r.data),
};

const expenseApi = {
  list: (params) => financeApi.get("/finance/bank-accounts/expenses", { params }).then((r) => r.data),
  log: (bankAccountId, payload) =>
    financeApi.post(`/finance/bank-accounts/${bankAccountId}/transactions`, payload).then((r) => r.data),
  categories: () => financeApi.get("/finance/expense-categories").then((r) => r.data),
};

const bankAccountApi = {
  list: () => financeApi.get("/finance/bank-accounts").then((r) => r.data),
  balance: (id) => financeApi.get(`/finance/bank-accounts/${id}/balance`).then((r) => r.data),
};

var stdin_default = api;
export {
  labQueueApi,
  collectionApi,
  labResultApi,
  labServiceApi,
  radiologyQueueApi,
  financeReportApi,
  expenseApi,
  bankAccountApi,
  financeApi,
  admissionApi,
  roomApi,
  ambulanceApi,
  assetApi,
  bedApi,
  checkupApi,
  infrastructureApi,
  appointmentsApi,
  authApi,
  bankApi,
  stdin_default as default,
  departmentApi,
  designationApi,
  directoryApi,
  directoryLogout,
  doctorsApi,
  featureFlagsApi,
  hospitalServiceApi,
  patientServicesApi,
  gstRateApi,
  invoiceApi,
  claimsApi,
  patientApi,
  peopleApi,
  pricingApi,
  radiologyApi,
  recordApi,
  roomLogsApi,
  specializationApi,
  staffApi,
  patientAdvanceApi,
  dashboardApi,
  drugsApi,
  roomTypeApi,
  consultationDraftsApi,
  vitalsApi,
  externalResultsApi,
  ipdVitalsApi,
  marApi,
  allergyApi,
  ioApi,
  labOrderApi,
  labCatalogApi,
  investigationsApi,
  nursingTaskApi,
  referralApi,
  zemaRulesApi,
  bloodBankApi,
  bioMedicalWasteApi,
};
