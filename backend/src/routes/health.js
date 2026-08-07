import { Router } from "express";

/**
 * Health + readiness for Nginx / Docker.
 */
export function createHealthRouter() {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "mcbuleli-isp" });
  });
  return router;
}
