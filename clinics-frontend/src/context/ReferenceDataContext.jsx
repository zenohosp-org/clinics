import { createContext, useContext, useEffect, useState } from "react";
import api from "@/utils/api";
import { useAuth } from "@/context/AuthContext";

const ReferenceDataContext = createContext({});

export function ReferenceDataProvider({ children }) {
    const [data, setData] = useState({});
    const { user } = useAuth();

    // Hold off on /reference-data until the user is authenticated. Firing
    // pre-auth produces a 401 on every login-page mount, which used to push
    // the page into a refresh loop (see api.js unauthorizedRedirect guard).
    useEffect(() => {
        if (!user) return;
        api.get("/reference-data")
            .then((res) => setData(res.data))
            .catch(() => {});
    }, [user]);

    return (
        <ReferenceDataContext.Provider value={data}>
            {children}
        </ReferenceDataContext.Provider>
    );
}

export function useReferenceData() {
    return useContext(ReferenceDataContext);
}
