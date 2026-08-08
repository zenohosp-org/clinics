import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch-with-refetch for a single async resource.
 *
 * Every Labs and Finance page needs the same four things: load on mount,
 * reload when a filter changes, expose a `reload()` for after a mutation, and
 * not blow up when the component unmounts mid-flight. Rather than repeat that
 * `useEffect` in eight places, they all go through here.
 *
 * @param fetcher  async () => data. Must be stable (wrap in useCallback), since
 *                 it is the effect's dependency — an inline arrow re-fetches
 *                 on every render.
 * @param options.initialData  value before the first resolve (default null)
 * @param options.enabled      skip fetching while false — for waiting on
 *                             hospitalId, which is null until auth resolves
 * @param options.onError      called with the error; use to surface a toast
 *
 * @returns { data, error, loading, reload, setData }
 */
export function useAsyncResource(fetcher, { initialData = null, enabled = true, onError } = {}) {
    const [data, setData] = useState(initialData);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(enabled);

    // Guards a setState after unmount, and lets a newer request invalidate an
    // older one — without it, a slow first response can land after a fast
    // second one and overwrite fresher data with stale data.
    const runIdRef = useRef(0);
    const onErrorRef = useRef(onError);
    useEffect(() => { onErrorRef.current = onError; }, [onError]);

    const load = useCallback(async () => {
        if (!enabled) {
            setLoading(false);
            return;
        }
        const runId = ++runIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const result = await fetcher();
            if (runId !== runIdRef.current) return; // superseded
            setData(result);
        } catch (err) {
            if (runId !== runIdRef.current) return;
            setError(err);
            onErrorRef.current?.(err);
        } finally {
            if (runId === runIdRef.current) setLoading(false);
        }
    }, [fetcher, enabled]);

    useEffect(() => {
        load();
        // Invalidate any in-flight request belonging to this mount.
        return () => { runIdRef.current++; };
    }, [load]);

    return { data, error, loading, reload: load, setData };
}

export default useAsyncResource;
