import React, { createContext, useContext, useState, useCallback } from "react";
const ThemeContext = createContext(void 0);
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem("hms_theme");
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const applyTheme = (t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
  };
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("hms_theme", next);
      return next;
    });
  }, []);
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
export {
  ThemeProvider,
  useTheme
};
