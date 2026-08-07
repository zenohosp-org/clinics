// Single source of truth for the dev-only mock-auth switch.
//
// Mock auth (VITE_DEV_MOCK_AUTH) hardcodes a fake dev identity and bypasses
// the real SSO session. That is only ever acceptable on a local dev host, so
// this gate ALSO requires the browser to be on localhost — making it
// physically impossible for a stray VITE_DEV_MOCK_AUTH=true to leak a fake
// identity into a deployed build, regardless of what any .env file says.
const onLocalDevHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname.endsWith('.localhost') ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '[::1]');

export const DEV_MOCK_AUTH =
    import.meta.env.VITE_DEV_MOCK_AUTH === 'true' && onLocalDevHost;
