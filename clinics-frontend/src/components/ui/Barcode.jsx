import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders a Code128 barcode as an inline SVG. `value` is the raw string to
 * encode (e.g. "1001-ADM-2026-0001") — encode the canonical/full ID, not the
 * display-stripped version, so a scan resolves the same record the backend
 * knows about.
 */
export default function Barcode({ value, height = 40, width = 1.2, fontSize = 12, className }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    JsBarcode(svgRef.current, value, {
      format: "CODE128",
      height,
      width,
      fontSize,
      margin: 6,
      displayValue: true,
    });
  }, [value, height, width, fontSize]);

  if (!value) return null;
  return <svg ref={svgRef} className={className} />;
}
