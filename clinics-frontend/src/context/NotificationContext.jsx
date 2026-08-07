import { createContext, useContext, useState, useCallback } from "react";

const NotificationContext = createContext(void 0);

function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback((message, type = "info") => {
    const id = crypto.randomUUID();
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <NotificationContext.Provider value={{ notifications, notify, dismiss }}>
      {children}
      <div className="hms-toast-container">
        {notifications.map((n) => (
          <div key={n.id} className={`hms-toast is-${n.type}`}>
            <span className="hms-toast__msg">{n.message}</span>
            <button onClick={() => dismiss(n.id)} className="hms-toast__dismiss">✕</button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used inside <NotificationProvider>");
  return ctx;
}

export { NotificationProvider, useNotification };
