import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { featureFlagsApi } from "@/utils/api";

const FeatureFlagsContext = createContext({
  flags: {},
  supported: [],
  loading: true,
  refresh: async () => {},
  setFlag: async () => {},
});

export function FeatureFlagsProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const hospitalId = user?.hospitalId || null;

  const [flags, setFlags] = useState({});
  const [supported, setSupported] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!hospitalId) {
      setFlags({});
      setSupported([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await featureFlagsApi.list(hospitalId);
      setFlags(data?.flags ?? {});
      setSupported(data?.supported ?? []);
    } catch {
      // Treat as all-enabled on failure so we never hide UI by accident.
      setFlags({});
      setSupported([]);
    } finally {
      setLoading(false);
    }
  }, [hospitalId]);

  useEffect(() => {
    if (isAuthenticated) refresh();
  }, [isAuthenticated, refresh]);

  const setFlag = useCallback(async (key, enabled) => {
    if (!hospitalId) return;
    const data = await featureFlagsApi.set(hospitalId, key, enabled);
    setFlags(data?.flags ?? {});
    setSupported(data?.supported ?? []);
  }, [hospitalId]);

  const value = useMemo(() => ({
    flags,
    supported,
    loading,
    refresh,
    setFlag,
  }), [flags, supported, loading, refresh, setFlag]);

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

// Defaults to enabled when the flag map hasn't loaded yet (or the key is
// unknown) so navigation never disappears mid-load.
export function useFeatureFlag(key) {
  const { flags } = useContext(FeatureFlagsContext);
  if (!(key in flags)) return true;
  return flags[key] !== false;
}
