import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  gatewayPublicState,
  gatewaySignIn,
  gatewayVerifyChallenge,
  gatewayRecover,
  gatewayRecoverConfirm,
  gatewayAcceptInvite,
} from "../services/auth/gateway-signin";

export async function authGatewayRoutes(app: FastifyInstance) {
  app.get("/auth/gateway/state", async () => gatewayPublicState());

  app.post(
    "/auth/gateway/signin",
    { config: { rateLimit: { max: 20, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(1).max(128),
          tenantSlug: z.string().optional(),
        })
        .parse(request.body);
      return gatewaySignIn(app, request, reply, body);
    }
  );

  app.post(
    "/auth/gateway/challenge",
    { config: { rateLimit: { max: 20, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const body = z
        .object({
          challengeId: z.string().min(20),
          code: z.string().min(6).max(16),
        })
        .parse(request.body);
      return gatewayVerifyChallenge(app, request, reply, body);
    }
  );

  app.post(
    "/auth/gateway/recover",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request) => {
      const body = z.object({ email: z.string().email() }).parse(request.body);
      return gatewayRecover(request, body.email);
    }
  );

  app.post("/auth/gateway/recover/confirm", async (request) => {
    const body = z
      .object({
        token: z.string().min(20),
        password: z.string().min(10).max(128),
      })
      .parse(request.body);
    return gatewayRecoverConfirm(request, body.token, body.password);
  });

  app.post("/auth/gateway/invite", async (request, reply) => {
    const body = z
      .object({
        token: z.string().min(8),
        password: z.string().min(10).max(128),
        name: z.string().max(120).optional(),
      })
      .parse(request.body);
    return gatewayAcceptInvite(app, request, reply, body);
  });
}
