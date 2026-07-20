import { buildApp } from "../app";

async function main() {
  const app = await buildApp();
  await app.ready();
  const lines = app.printRoutes().split("\n").filter((l) => /auth|refresh|mfa/i.test(l));
  console.log(lines.join("\n") || "(no auth routes printed)");
  const r = await app.inject({
    method: "POST",
    url: "/auth/refresh",
    headers: { "content-type": "application/json" },
    payload: {},
  });
  console.log("refresh", r.statusCode, r.body.slice(0, 200));
  const email = process.env.E2E_SUPERADMIN_EMAIL || "";
  const password = process.env.E2E_SUPERADMIN_PASSWORD || "";
  if (email && password) {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      payload: { email, password },
    });
    console.log("login", login.statusCode, Object.keys((login.json() as object) || {}));
  } else {
    console.log("login probe skipped: configure E2E_SUPERADMIN_EMAIL/PASSWORD");
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
