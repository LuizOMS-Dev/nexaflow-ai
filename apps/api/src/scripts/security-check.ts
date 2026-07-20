/**
 * npm run security:check -w @nexaflow/api
 * Valida pré-condições de produção (fail-closed).
 */
import { collectProductionIssues } from "../services/security/production-guard";
import { getRedis } from "../services/security/redis";
import { env, isWaGatewayReady } from "../lib/env";

async function main() {
  console.log("NexaFlow security:check");
  console.log(`NODE_ENV=${env.nodeEnv}`);
  console.log(`superadminMfaRequired=${env.superadminMfaRequired}`);
  console.log(`mailProvider=${env.mailProvider}`);
  console.log(`appPublicUrl=${env.appPublicUrl}`);
  console.log(`waGateway=${env.waGatewayProvider} ready=${isWaGatewayReady()}`);

  let redisOk: boolean | null = null;
  try {
    const r = await getRedis();
    redisOk = Boolean(r);
    console.log(`Redis: ${redisOk ? "ok" : "unavailable"}`);
  } catch {
    redisOk = false;
    console.log("Redis: unavailable");
  }

  const issues = collectProductionIssues({ redisOk });
  for (const i of issues) {
    console.log(`[${i.severity}] ${i.code}: ${i.message}`);
  }

  if (env.nodeEnv === "production") {
    const blockers = issues.filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
    if (blockers.length) {
      console.error(`FAIL: ${blockers.length} bloqueador(es)`);
      process.exit(1);
    }
  }

  console.log(issues.length ? `WARN/INFO: ${issues.length} issue(s)` : "OK: sem issues críticos");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
