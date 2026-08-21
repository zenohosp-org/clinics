import { useCallback, useMemo } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { patientVaccinationApi } from "@/utils/api";
import { useAsyncResource } from "./useAsyncResource";

const DUE_SOON_WINDOW_DAYS = 30;

/**
 * A patient's immunization timeline plus the mutations the Vaccines tab
 * needs (generate the standard schedule, mark a dose given, log a custom
 * dose, edit/remove). Built on useAsyncResource so it gets load-on-mount,
 * reload-after-mutation and unmount-safety for free.
 *
 * Buckets are derived here rather than in the component so any future
 * surface (e.g. a hospital-wide "vaccines due" list) can reuse the same
 * overdue/due-soon/upcoming split.
 */
export function useVaccinations(patientId, hospitalId) {
  const fetcher = useCallback(
    () => patientVaccinationApi.list(patientId, hospitalId),
    [patientId, hospitalId]
  );

  const { data, loading, reload, setData } = useAsyncResource(fetcher, {
    initialData: [],
    enabled: !!patientId && !!hospitalId,
  });

  const records = data ?? [];

  const groups = useMemo(() => {
    const today = new Date();
    const overdue = [];
    const dueSoon = [];
    const upcoming = [];
    const administered = [];
    const skipped = [];

    records.forEach((rec) => {
      if (rec.status === "ADMINISTERED") {
        administered.push(rec);
        return;
      }
      if (rec.status === "SKIPPED") {
        skipped.push(rec);
        return;
      }
      const daysOut = rec.scheduledDate ? differenceInCalendarDays(parseISO(rec.scheduledDate), today) : null;
      if (daysOut === null || daysOut > DUE_SOON_WINDOW_DAYS) upcoming.push(rec);
      else if (daysOut < 0) overdue.push(rec);
      else dueSoon.push(rec);
    });

    const byDate = (a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "");
    const byGiven = (a, b) => (b.administeredDate ?? "").localeCompare(a.administeredDate ?? "");
    overdue.sort(byDate);
    dueSoon.sort(byDate);
    upcoming.sort(byDate);
    administered.sort(byGiven);

    return { overdue, dueSoon, upcoming, administered, skipped };
  }, [records]);

  const generateSchedule = useCallback(async () => {
    const updated = await patientVaccinationApi.generateSchedule(patientId);
    setData(updated);
    return updated;
  }, [patientId, setData]);

  const addRecord = useCallback(
    async (payload) => {
      await patientVaccinationApi.add(patientId, payload);
      return reload();
    },
    [patientId, reload]
  );

  const updateRecord = useCallback(
    async (vaccinationId, payload) => {
      await patientVaccinationApi.update(patientId, vaccinationId, payload);
      return reload();
    },
    [patientId, reload]
  );

  const markAdministered = useCallback(
    (vaccinationId, { administeredDate, batchNumber, notes } = {}) =>
      updateRecord(vaccinationId, {
        status: "ADMINISTERED",
        administeredDate: administeredDate ?? new Date().toISOString().slice(0, 10),
        batchNumber,
        notes,
      }),
    [updateRecord]
  );

  const removeRecord = useCallback(
    async (vaccinationId) => {
      await patientVaccinationApi.remove(patientId, vaccinationId);
      return reload();
    },
    [patientId, reload]
  );

  return {
    records,
    groups,
    dueCount: groups.overdue.length + groups.dueSoon.length,
    loading,
    reload,
    generateSchedule,
    addRecord,
    updateRecord,
    markAdministered,
    removeRecord,
  };
}

export default useVaccinations;
