/**
 * Render fallback entrypoint for monorepo root deployments.
 * If the service is mistakenly started from repository root with `node src/server.js`,
 * this shim forwards execution to the real backend server.
 */
import "../backend/src/server.js";
