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
