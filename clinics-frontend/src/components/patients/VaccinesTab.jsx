import { useState } from "react";
import { Syringe, CalendarClock } from "lucide-react";
import { CenterLoader } from "@/components/ui/Loader";
import { formatDate } from "@/utils/validators";
import { useVaccinations } from "@/hooks/useVaccinations";
import VaccineDoseModal from "@/components/modals/VaccineDoseModal";

const STATUS_META = {
  overdue: { label: "Overdue", tone: "is-danger", statusMod: "is-overdue", statusLabel: "Overdue" },
  dueSoon: { label: "Due Soon", tone: "is-warning", statusMod: "is-due-soon", statusLabel: "Due Soon" },
  upcoming: { label: "Upcoming", tone: "", statusMod: "is-upcoming", statusLabel: "Scheduled" },
  administered: { label: "Administered", tone: "is-success", statusMod: "is-administered", statusLabel: "Given" },
  skipped: { label: "Skipped", tone: "", statusMod: "is-skipped", statusLabel: "Skipped" },
};

function VaccineGroup({ groupKey, records, onRecord }) {
  const meta = STATUS_META[groupKey];
  return (
    <div className="hms-pat-rec-group">
      <div className="hms-pat-rec-group__head">
        <span className={`hms-pat-rec-group__general-tag ${meta.tone}`}>{meta.label}</span>
        <div className="hms-pat-rec-group__rule" />
        <span className="hms-pat-rec-group__count">{records.length}</span>
      </div>
      <div className="hms-pat-vax-list">
        {records.map((rec) => (
          <div key={rec.id} className="hms-pat-vax-row">
            <div className="hms-pat-vax-row__body">
              <div className="hms-pat-vax-row__icon">
                <Syringe className="w-4 h-4" />
              </div>
              <div>
                <p className="hms-pat-vax-row__name">
                  {rec.vaccineName}{rec.doseNumber ? ` · Dose ${rec.doseNumber}` : ""}
                </p>
                <div className="hms-pat-vax-row__meta">
                  {rec.status === "ADMINISTERED" ? (
                    <>
                      <p>Given {formatDate(rec.administeredDate)}</p>
                      {rec.administeredByName && (
                        <>
                          <p className="hms-pat-vax-row__sep">·</p>
                          <p>{rec.administeredByName}</p>
                        </>
                      )}
                      {rec.batchNumber && (
                        <>
                          <p className="hms-pat-vax-row__sep">·</p>
                          <p>Batch {rec.batchNumber}</p>
                        </>
                      )}
                    </>
                  ) : (
                    <p>Due {formatDate(rec.scheduledDate)}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="hms-pat-vax-row__actions">
              <span className={`hms-pat-vax-status ${meta.statusMod}`}>{meta.statusLabel}</span>
              {rec.status === "SCHEDULED" && (
                <button onClick={() => onRecord(rec)} className="hms-pat-vax-record-btn">
                  Record
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-patient immunization timeline tab. Data + mutations come from
 * useVaccinations; this component is purely presentational + the
 * generate/record/log-custom interactions.
 */
function VaccinesTab({ patientId, hospitalId, patientDob, patientFirstName }) {
  const { records, groups, loading, generateSchedule, addRecord, markAdministered } =
    useVaccinations(patientId, hospitalId);
  const [modalState, setModalState] = useState(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateSchedule();
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <CenterLoader />;

  const hasRecords = records.length > 0;

  return (
    <div className="hms-pat-detail__wrap is-md">
      <div className="hms-pat-tab-head">
        <div>
          <h3 className="hms-pat-tab-head__title">Vaccination Timeline</h3>
          <p className="hms-pat-tab-head__sub">
            {records.length} dose{records.length !== 1 ? "s" : ""} tracked for {patientFirstName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {patientDob && (
            <button onClick={handleGenerate} disabled={generating} className="hms-pat-bill-new-btn">
              <CalendarClock className="w-3.5 h-3.5" />
              {generating ? "Generating…" : "Generate Standard Schedule"}
            </button>
          )}
          <button onClick={() => setModalState({ mode: "custom" })} className="zu-btn-secondary is-sm">
            + Log Vaccine
          </button>
        </div>
      </div>

      {!hasRecords ? (
        <div className="hms-pat-tab-empty">
          <Syringe className="hms-pat-tab-empty__icon" />
          <p className="hms-pat-tab-empty__title">No vaccination records yet</p>
          <p className="hms-pat-tab-empty__sub">
            {patientDob
              ? "Generate the standard immunization schedule to start tracking, or log a dose manually."
              : "Add a date of birth to auto-generate the standard schedule, or log a dose manually."}
          </p>
        </div>
      ) : (
        <div className="hms-pat-rec-groups">
          {groups.overdue.length > 0 && (
            <VaccineGroup groupKey="overdue" records={groups.overdue} onRecord={(r) => setModalState({ mode: "administer", record: r })} />
          )}
          {groups.dueSoon.length > 0 && (
            <VaccineGroup groupKey="dueSoon" records={groups.dueSoon} onRecord={(r) => setModalState({ mode: "administer", record: r })} />
          )}
          {groups.upcoming.length > 0 && (
            <VaccineGroup groupKey="upcoming" records={groups.upcoming} onRecord={(r) => setModalState({ mode: "administer", record: r })} />
          )}
          {groups.administered.length > 0 && (
            <VaccineGroup groupKey="administered" records={groups.administered} onRecord={() => {}} />
          )}
          {groups.skipped.length > 0 && (
            <VaccineGroup groupKey="skipped" records={groups.skipped} onRecord={() => {}} />
          )}
        </div>
      )}

      <VaccineDoseModal
        isOpen={!!modalState}
        mode={modalState?.mode}
        record={modalState?.record}
        onClose={() => setModalState(null)}
        onAdminister={markAdministered}
        onAddCustom={addRecord}
      />
    </div>
  );
}

export default VaccinesTab;
