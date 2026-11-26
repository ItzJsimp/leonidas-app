// Fixed values shared by the e2e server setup, the Vite e2e project and the tests.
export const E2E_SERVER_PORT = Number(process.env.LEONIDAS_E2E_SERVER_PORT ?? 15990);
export const E2E_BROWSER_PORT = Number(process.env.LEONIDAS_E2E_BROWSER_PORT ?? 63390);
// Test-only credential for a throwaway server; it grants nothing outside the e2e run.
export const E2E_AUTH_TOKEN = "leonidas-e2e-test-token-0000000000000000";
// The assistant text in the replayed `simple` Codex transcript.
export const E2E_TURN_REPLY = "fixture simple ok";
