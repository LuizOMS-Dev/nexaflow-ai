import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy same-origin → API.
 * Encaminha Cookie / Set-Cookie para autenticação HttpOnly.
 */
function targetBase() {
  const raw =
    process.env.API_PROXY_TARGET ||
    process.env.API_INTERNAL_URL ||
    "http://127.0.0.1:4000";
  return raw.replace(/\/$/, "");
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const base = targetBase();
  const path = pathSegments.join("/");
  const url = `${base}/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", req.headers.get("accept") || "application/json");

  // cookies do browser → API
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  // Origin/Referer → CSRF guard da API (não descartar no proxy)
  const origin = req.headers.get("origin");
  if (origin) headers.set("origin", origin);
  const referer = req.headers.get("referer");
  if (referer) headers.set("referer", referer);

  // IP real se disponível (rate limit)
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) headers.set("x-forwarded-for", fwd);
  const realIp = req.headers.get("x-real-ip");
  if (realIp) headers.set("x-real-ip", realIp);

  const init: RequestInit = {
    method: req.method,
    headers,
    // @ts-expect-error Node fetch duplex when body is streamed
    duplex: "half",
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 0) {
      init.body = buf;
    } else if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      headers.set("content-type", "application/json");
      init.body = Buffer.from("{}");
    }
  }

  try {
    const upstream = await fetch(url, init);
    const out = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) out.set("content-type", ct);
    out.set("cache-control", "no-store");

    // repassa Set-Cookie (pode haver vários)
    const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] })
      .getSetCookie?.();
    if (getSetCookie && getSetCookie.length) {
      for (const c of getSetCookie) out.append("set-cookie", c);
    } else {
      const sc = upstream.headers.get("set-cookie");
      if (sc) out.append("set-cookie", sc);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "proxy error";
    return NextResponse.json(
      {
        error: "PROXY_ERROR",
        message: `Não foi possível falar com a API em ${base}. ${message}`,
      },
      { status: 502 }
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path || []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
