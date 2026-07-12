import { Router } from "express";
import { authenticate as protect } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/roleGuard";
import { IntegrationController } from "../controllers/integration.controller";
import { cacheMiddleware, invalidateCache } from "../middlewares/cache";
import { TTL } from "../services/cache.service";

const router = Router();

/**
 * POST /webhook — Handles incoming webhook events from external systems. No authentication required.
 */
router.post("/webhook", IntegrationController.handleWebhook);

/**
 * GET /sync/logs — Retrieves synchronization logs. Requires admin authentication.
 */
router.get("/sync/logs", protect, requireAdmin, cacheMiddleware({ ttl: TTL.ENTITY, tags: ["integration"] }), IntegrationController.getSyncLogs);

/**
 * POST /sync/trigger — Triggers a manual synchronization run. Requires admin authentication.
 */
router.post("/sync/trigger", protect, requireAdmin, IntegrationController.triggerSync, invalidateCache({ tags: ["integration"] }));

/**
 * GET /credentials — Lists all API credentials. Requires admin authentication.
 */
router.get("/credentials", protect, requireAdmin, cacheMiddleware({ ttl: TTL.ENTITY, tags: ["integration"] }), IntegrationController.listCredentials);

/**
 * POST /credentials — Creates a new API credential. Requires admin authentication.
 */
router.post("/credentials", protect, requireAdmin, IntegrationController.createCredential, invalidateCache({ tags: ["integration"] }));

/**
 * PUT /credentials/:id/rotate — Rotates an API credential's secret key. Requires admin authentication.
 */
router.put("/credentials/:id/rotate", protect, requireAdmin, IntegrationController.rotateCredential, invalidateCache({ tags: ["integration"] }));

/**
 * DELETE /credentials/:id — Deactivates an API credential by ID. Requires admin authentication.
 */
router.delete("/credentials/:id", protect, requireAdmin, IntegrationController.deactivateCredential, invalidateCache({ tags: ["integration"] }));

/**
 * GET /webhook-events — Retrieves webhook event logs. Requires admin authentication.
 */
router.get("/webhook-events", protect, requireAdmin, cacheMiddleware({ ttl: TTL.ENTITY, tags: ["integration"] }), IntegrationController.getWebhookEvents);

export default router;
