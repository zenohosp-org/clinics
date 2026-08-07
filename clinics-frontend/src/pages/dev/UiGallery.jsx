/* eslint-disable no-console */
import { useState } from "react";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Edit2,
    FileSearch,
    Info,
    MoreHorizontal,
    Plus,
    Power,
    RefreshCcw,
    Trash2,
} from "lucide-react";
import {
    Alert,
    Badge,
    Button,
    Card,
    Drawer,
    EmptyState,
    FormGroup,
    Input,
    Menu,
    Modal,
    PageHeader,
    SearchBar,
    Select,
    Table,
    Tabs,
    Textarea,
} from "@/components/ui";

/**
 * Dev-only visual gallery for the HMS design system.
 *
 * Mount at /dev/ui-gallery. Every primitive is rendered in its key
 * variants and states so a regression in hms-system.css or in the React
 * shells surfaces immediately. Interactive demos cover the components
 * whose behaviour can't be verified statically (Modal/Drawer/Tabs/
 * SearchBar). Public route so it works without backend auth — no
 * business logic, safe to mount on any branch.
 */
const TOKEN_KEYS = [
    "brand-primary",
    "gray-50",
    "gray-200",
    "gray-500",
    "gray-800",
    "success",
    "warning",
    "danger",
    "info",
];

export default function UiGallery() {
    const [tab, setTab] = useState("overview");
    const [pillTab, setPillTab] = useState("opd");
    const [modalSize, setModalSize] = useState(null); // "sm" | "md" | "lg" | "xl"
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [name, setName] = useState("");
    const [notes, setNotes] = useState("");
    const [role, setRole] = useState("doctor");

    const tableData = [
        { id: 1, name: "Anita Sharma", mrn: "MRN-00012", status: "Active", visits: 3 },
        { id: 2, name: "Karan Mehta", mrn: "MRN-00031", status: "Discharged", visits: 1 },
        { id: 3, name: "Priya Iyer", mrn: "MRN-00045", status: "Admitted", visits: 5 },
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            <PageHeader
                title="HMS UI Gallery"
                subtitle="Phase 2 design-system primitives — visual + interaction reference"
                actions={
                    <>
                        <Button variant="ghost">Docs</Button>
                        <Button variant="primary">
                            <Plus size={14} strokeWidth={2.4} />
                            New record
                        </Button>
                    </>
                }
            />

            <div className="max-w-7xl mx-auto px-8 py-6 flex flex-col gap-8">
                <Section title="Buttons">
                    <Row>
                        <Button variant="primary">Primary</Button>
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="cancel">Cancel</Button>
                        <Button variant="danger">Danger</Button>
                        <Button variant="danger" outline>Danger outline</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="icon" aria-label="Refresh"><RefreshCcw size={16} /></Button>
                    </Row>
                    <Row>
                        <Button variant="primary" size="sm">Primary sm</Button>
                        <Button variant="secondary" size="sm">Secondary sm</Button>
                        <Button variant="danger" size="sm">Danger sm</Button>
                    </Row>
                    <Row>
                        <Button variant="primary" color="blue">Blue</Button>
                        <Button variant="primary" color="orange">Orange</Button>
                        <Button variant="primary" color="green">Green</Button>
                    </Row>
                    <Row>
                        <Button variant="primary" loading>Saving…</Button>
                        <Button variant="secondary" loading>Loading…</Button>
                        <Button variant="primary" disabled>Disabled</Button>
                    </Row>
                    <Row>
                        <Button variant="primary" full>Full width primary</Button>
                    </Row>
                </Section>

                <Section title="Cards">
                    <div className="hms-stat-grid">
                        <Card>
                            <strong>Plain card</strong>
                            <p className="m-0 text-13 text-gray-500">
                                Default surface used across the app.
                            </p>
                        </Card>
                        <Card interactive>
                            <strong>Interactive card</strong>
                            <p className="m-0 text-13 text-gray-500">Hover to lift.</p>
                        </Card>
                        <Card glass>
                            <strong>Glass card</strong>
                            <p className="m-0 text-13 text-gray-500">Translucent variant.</p>
                        </Card>
                    </div>
                </Section>

                <Section title="Badges">
                    <Row>
                        <Badge tone="success">Success</Badge>
                        <Badge tone="warning">Warning</Badge>
                        <Badge tone="danger">Danger</Badge>
                        <Badge tone="info">Info</Badge>
                        <Badge tone="neutral">Neutral</Badge>
                    </Row>
                    <Row>
                        <Badge tone="success" soft>Soft success</Badge>
                        <Badge tone="warning" soft>Soft warning</Badge>
                        <Badge tone="danger" soft>Soft danger</Badge>
                    </Row>
                </Section>

                <Section title="Form fields">
                    <Card>
                        <div className="hms-form-grid is-2col">
                            <FormGroup label="Patient name" hint="As shown on ID">
                                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Anita Sharma" />
                            </FormGroup>
                            <FormGroup label="Role">
                                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                                    <option value="doctor">Doctor</option>
                                    <option value="staff">Staff</option>
                                    <option value="hospital_admin">Hospital admin</option>
                                </Select>
                            </FormGroup>
                            <FormGroup label="Email" error="Must be a valid hospital email">
                                <Input type="email" defaultValue="badaddress" />
                            </FormGroup>
                            <FormGroup label="Mobile" hint="10 digits, no country code">
                                <Input inputMode="numeric" placeholder="98765 43210" />
                            </FormGroup>
                            <FormGroup label="Notes" className="grid-col-full" >
                                <Textarea
                                    rows={3}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Anything to flag for the next visit…"
                                />
                            </FormGroup>
                        </div>
                    </Card>
                </Section>

                <Section title="Search bar">
                    <div className="max-w-md">
                        <SearchBar
                            value={search}
                            onChange={setSearch}
                            placeholder="Search patients by name or MRN…"
                        />
                    </div>
                    <p className="mt-2 mb-0 text-gray-500 text-12">
                        Current value: <code>{JSON.stringify(search)}</code>
                    </p>
                </Section>

                <Section title="Tabs — underline (page navigation)">
                    <Tabs
                        type="underline"
                        active={tab}
                        onChange={setTab}
                        tabs={[
                            { id: "overview", label: "Overview", count: 12 },
                            { id: "vitals", label: "Vitals", count: 4 },
                            { id: "prescriptions", label: "Prescriptions" },
                            { id: "lab", label: "Lab results", count: 0 },
                        ]}
                        panels={{
                            overview: <Card>Overview panel content.</Card>,
                            vitals: <Card>Vitals panel content.</Card>,
                            prescriptions: <Card>Prescriptions panel content.</Card>,
                            lab: <Card>Lab results panel content.</Card>,
                        }}
                    />
                </Section>

                <Section title="Tabs — pill (segmented control)">
                    <Tabs
                        type="pill"
                        active={pillTab}
                        onChange={setPillTab}
                        tabs={[
                            { id: "opd", label: "OPD", count: 24 },
                            { id: "ipd", label: "IPD", count: 8 },
                            { id: "ambulance", label: "Ambulance" },
                        ]}
                    />
                </Section>

                <Section title="Table">
                    <Table
                        columns={[
                            { header: "Patient", accessor: "name", width: "32%" },
                            { header: "MRN", accessor: "mrn", width: "20%" },
                            {
                                header: "Status",
                                render: (r) => (
                                    <Badge
                                        tone={
                                            r.status === "Active"
                                                ? "success"
                                                : r.status === "Discharged"
                                                    ? "neutral"
                                                    : "info"
                                        }
                                    >
                                        {r.status}
                                    </Badge>
                                ),
                            },
                            { header: "Visits", accessor: "visits", align: "right" },
                        ]}
                        data={tableData}
                        onRowClick={(row) => console.log("clicked row", row)}
                    />
                </Section>

                <Section title="Empty state">
                    <EmptyState
                        icon={<FileSearch size={24} />}
                        title="No bookings yet"
                        description="Once a checkup is booked it will show up here. Try resetting the date filter or adjusting the search above."
                        action={<Button variant="primary"><Plus size={14} />New booking</Button>}
                    />
                </Section>

                <Section title="Alerts">
                    <div className="flex flex-col gap-2">
                        <Alert tone="info" icon={<Info size={16} />} title="Note">
                            New external lab entries are scoped to this appointment only.
                        </Alert>
                        <Alert tone="warning" icon={<AlertTriangle size={16} />} title="Heads up">
                            Backdating the prescription beyond 7 days requires hospital-admin approval.
                        </Alert>
                        <Alert tone="danger" icon={<Trash2 size={16} />} title="Cannot delete">
                            This doctor has 3 upcoming appointments. Reassign them first.
                        </Alert>
                        <Alert tone="success" icon={<CheckCircle2 size={16} />} title="Saved">
                            Vitals captured at 12:42 PM.
                        </Alert>
                    </div>
                </Section>

                <Section title="Overlays — Modal & Drawer">
                    <Row>
                        <Button variant="secondary" onClick={() => setModalSize("sm")}>Small modal</Button>
                        <Button variant="secondary" onClick={() => setModalSize("md")}>Medium modal</Button>
                        <Button variant="secondary" onClick={() => setModalSize("lg")}>Large modal</Button>
                        <Button variant="secondary" onClick={() => setModalSize("xl")}>XL modal</Button>
                        <Button variant="primary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
                    </Row>
                </Section>

                <Section title="Menu (dropdown / kebab popover)">
                    <Card>
                        <p className="m-0 text-13 text-gray-500">
                            Portalled to <code>#modal-root</code> and positioned from the trigger's
                            <code> getBoundingClientRect()</code> — never clips inside table overflow.
                            Closes on outside click, ESC, and any ancestor scroll.
                        </p>
                        <div className="flex gap-6 mt-3 items-center">
                            <Menu
                                triggerIcon={<MoreHorizontal size={18} />}
                                triggerLabel="Row actions"
                                align="right"
                                items={[
                                    { label: "Edit", icon: <Edit2 size={14} />, onClick: () => console.log("edit") },
                                    { label: "Deactivate", icon: <Power size={14} />, onClick: () => console.log("toggle") },
                                    { divider: true },
                                    { label: "Delete", icon: <Trash2 size={14} />, tone: "danger", onClick: () => console.log("delete") },
                                ]}
                            />
                            <span className="text-12 text-gray-500">
                                ← kebab trigger; right-anchored
                            </span>
                            <span className="flex-1" />
                            <Menu
                                triggerIcon={<>Actions <MoreHorizontal size={14} className="ml-1" /></>}
                                triggerClassName="zu-btn-secondary is-sm"
                                triggerLabel="Bulk actions"
                                align="left"
                                items={[
                                    { label: "Export selected", icon: <FileSearch size={14} /> },
                                    { label: "Mark inactive", icon: <Power size={14} /> },
                                    { divider: true },
                                    { label: "Remove selected", icon: <Trash2 size={14} />, tone: "danger", disabled: true },
                                ]}
                            />
                            <span className="text-12 text-gray-500">
                                button trigger; left-anchored
                            </span>
                        </div>
                    </Card>
                </Section>

                <Section title="Live tokens (read directly from :root)">
                    <Card>
                        <div className="hms-token-grid">
                            {TOKEN_KEYS.map((k) => (
                                <div key={k} className="flex items-center gap-2 text-12">
                                    <span
                                        className={`hms-color-swatch hms-color-swatch--${k}`}
                                    />
                                    <code>--hms-{k}</code>
                                </div>
                            ))}
                        </div>
                    </Card>
                </Section>

                <div className="flex items-center gap-2 text-gray-400 text-12 py-4">
                    <Activity size={14} /> Gallery page is dev-only — not linked from the app shell. Mount path is <code>/dev/ui-gallery</code>.
                </div>
            </div>

            <Modal
                isOpen={modalSize !== null}
                onClose={() => setModalSize(null)}
                size={modalSize || "md"}
                title={`Modal — size ${modalSize}`}
                footer={
                    <>
                        <Button variant="cancel" onClick={() => setModalSize(null)}>Cancel</Button>
                        <Button variant="primary" onClick={() => setModalSize(null)}>Confirm</Button>
                    </>
                }
            >
                <p className="m-0">
                    This modal is portalled to <code>#modal-root</code>. ESC closes, click on the dark backdrop closes,
                    clicks inside the dialog don't bubble out.
                </p>
                <p className="mt-3 text-gray-500">
                    Use this for forms (e.g. new patient, new prescription), confirmations, and any blocking dialog.
                </p>
            </Modal>

            <Drawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title="Appointment details"
                subtitle="Drawer mounted via portal — backdrop click closes."
                footer={
                    <>
                        <Button variant="cancel" onClick={() => setDrawerOpen(false)}>Close</Button>
                        <Button variant="primary" onClick={() => setDrawerOpen(false)}>Save</Button>
                    </>
                }
            >
                <FormGroup label="Patient name">
                    <Input placeholder="Anita Sharma" />
                </FormGroup>
                <div className="hms-gallery-spacer" />
                <FormGroup label="Notes">
                    <Textarea rows={5} placeholder="Anything to flag…" />
                </FormGroup>
            </Drawer>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section>
            <h2 className="hms-section-label mb-3">{title}</h2>
            <div className="flex flex-col gap-3">{children}</div>
        </section>
    );
}

function Row({ children }) {
    return <div className="flex flex-wrap gap-2 items-center">{children}</div>;
}
