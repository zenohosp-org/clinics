import { useEffect, useState } from "react";
import { labCatalogApi } from "@/utils/api";

/**
 * Single source for the orderable investigation catalogue used by every order
 * picker (IPD Labs tab, Consultation View, Consultation modal).
 *
 * Reads the labs catalogue (lab_services) directly from the labs service
 * (labCatalogApi -> api-labs) for every tenant — labs owns the discipline +
 * price, so a radiology test can never be misclassified as pathology, and
 * each hospital sees exactly the tests it has configured/enabled in labs
 * (labs auto-seeds a starter set for a hospital on its first read, so a
 * brand-new tenant is never left with an empty picker). The read bypasses
 * the HMS /api/lab-services proxy: the HMS Render edge returned a 502 on
 * that 45 KB catalogue payload even though Spring Boot answered 200, and the
 * direct call matches the radiology/investigations reads. hospitalId is
 * resolved by labs from the forwarded JWT, never a client-supplied param.
 */

/**
 * Adapt a labs lab_services row to the picker's catalogue shape. Discipline is
 * authoritative — RADIOLOGY routes to the radiology pipeline, everything else
 * (PATHOLOGY/CYTOLOGY/HISTOPATHOLOGY) to lab. labServiceId is carried for the
 * V15 catalog-linked create; the order payload keeps sending free-text
 * serviceName/price until that ships.
 */
const adaptLabsRow = (r) => ({
  id: r.id,
  labServiceId: r.id,
  name: r.name,
  kind: r.discipline === "RADIOLOGY" ? "RADIOLOGY" : "LAB",
  price: r.price,
  gstRate: r.gstRate,
  department: { name: r.category || r.discipline },
  discipline: r.discipline,
});

export function useInvestigationCatalog(hospitalId) {
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    if (!hospitalId) { setCatalog([]); return undefined; }
    let cancelled = false;

    // hospitalId scopes the request server-side via the JWT; it isn't sent as
    // a param. .catch => [] so a labs outage degrades to an empty picker,
    // never a broken tab.
    labCatalogApi.list({ active: true })
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        // Orderable = active + priced. Panel or child analyte, labs treats both
        // as independently orderable rows — there's no panel-only restriction
        // on labs' side. A null price means the hospital hasn't configured that
        // row for sale yet (labs Settings -> Lab Services), so it's excluded
        // here rather than letting a ₹0 line item reach the order/invoice.
        setCatalog(
          list
            .filter((r) => r.active !== false && Number(r.price) > 0)
            .map(adaptLabsRow)
        );
      })
      .catch(() => { if (!cancelled) setCatalog([]); });

    return () => { cancelled = true; };
  }, [hospitalId]);

  return catalog;
}
