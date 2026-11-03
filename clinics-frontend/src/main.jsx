import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);

// Prevent mouse-wheel scroll from changing a focused <input type="number"> value.
// Blur the number field on wheel so the page scrolls and the value only changes
// when the user types. Global: covers every number input, present and future.
document.addEventListener(
  "wheel",
  (e) => {
    const el = e.target;
    if (
      el instanceof HTMLInputElement &&
      el.type === "number" &&
      el === document.activeElement
    ) {
      el.blur();
    }
  },
  { passive: true }
);

// Strip leading zeros while typing in an <input type="number">, so a field that
// defaults to 0 reads "10" (not "010") after the user types 10. React won't
// re-sync a number input whose numeric value is unchanged (010 == 10), so this
// can't be fixed from component state. Runs in the capture phase, before React's
// listener, and writes through the prototype setter so React still registers the
// edit and onChange receives the cleaned value. Global, like the wheel guard above.
const setNativeInputValue = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
).set;
window.addEventListener(
  "input",
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== "number") return;
    const cleaned = el.value.replace(/^(-?)0+(?=\d)/, "$1");
    if (cleaned !== el.value) setNativeInputValue.call(el, cleaned);
  },
  true
);
