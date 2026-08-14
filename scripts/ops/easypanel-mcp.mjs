#!/usr/bin/env node
/**
 * MCP stdio — EasyPanel API oficial.
 * Credenciais (nunca commitar):
 *   EASYPANEL_URL
 *   EASYPANEL_API_TOKEN
 * ou arquivo %USERPROFILE%\.easypanel-mcp.env
 */
import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv(join(homedir(), ".easypanel-mcp.env"));
loadDotEnv(join(process.cwd(), ".env.easypanel.local"));

function baseUrl() {
  const url = (process.env.EASYPANEL_URL || "").trim().replace(/\/+$/, "");
  if (!url) {
    throw new Error(
      "EASYPANEL_URL ausente. Crie %USERPROFILE%\\.easypanel-mcp.env com EASYPANEL_URL e EASYPANEL_API_TOKEN."
    );
  }
  return url;
}

function token() {
  const t = (process.env.EASYPANEL_API_TOKEN || process.env.EASYPANEL_API_KEY || "").trim();
  if (!t) {
    throw new Error(
      "EASYPANEL_API_TOKEN ausente. No EasyPanel: perfil → API token, ou faça login e use o Bearer."
    );
  }
  return t;
}

async function rest(method, path, body) {
  const url = `${baseUrl()}/api${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token()}`,
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`EasyPanel ${method} ${path} → ${res.status}: ${text.slice(0, 2000)}`);
  }
  return json;
}

async function trpc(procedure, input, method) {
  const proc = procedure.replace(/^\//, "");
  const verb = method || guessMethod(proc);
  const url = new URL(`${baseUrl()}/api/trpc/${proc}`);
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token()}`,
    "Content-Type": "application/json",
  };
  let res;
  if (verb === "GET") {
    if (input && Object.keys(input).length) {
      url.searchParams.set("input", JSON.stringify({ json: input }));
    }
    res = await fetch(url, { method: "GET", headers });
  } else {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ json: input ?? {} }),
    });
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`tRPC ${proc} → ${res.status}: ${text.slice(0, 2000)}`);
  }
  return json?.result?.data?.json ?? json?.result?.data ?? json;
}

function guessMethod(procedure) {
  const name = procedure.split(".").pop()?.toLowerCase() || "";
  return /^(list|get|inspect|check|search)/.test(name) ? "GET" : "POST";
}

const TOOLS = [
  {
    name: "session",
    description: "Valida o token e devolve a sessão EasyPanel.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description: "Lista projetos e serviços do painel.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "inspect_project",
    description: "Inspeciona um projeto (nome, ex: i9atendimento).",
    inputSchema: {
      type: "object",
      properties: { projectName: { type: "string" } },
      required: ["projectName"],
    },
  },
  {
    name: "create_compose",
    description: "Cria serviço Compose no projeto.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        serviceName: { type: "string" },
      },
      required: ["projectName", "serviceName"],
    },
  },
  {
    name: "update_compose_github",
    description: "Aponta o Compose para um repo GitHub e o arquivo compose.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        serviceName: { type: "string" },
        owner: { type: "string" },
        repo: { type: "string" },
        branch: { type: "string" },
        composeFile: { type: "string" },
        path: { type: "string" },
      },
      required: ["projectName", "serviceName", "owner", "repo", "branch"],
    },
  },
  {
    name: "update_compose_env",
    description: "Define o bloco .env do serviço Compose (texto KEY=value).",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        serviceName: { type: "string" },
        env: { type: "string" },
        createDotEnv: { type: "boolean" },
      },
      required: ["projectName", "serviceName", "env"],
    },
  },
  {
    name: "deploy_compose",
    description: "Dispara docker compose up --build do serviço Compose.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        serviceName: { type: "string" },
      },
      required: ["projectName", "serviceName"],
    },
  },
  {
    name: "destroy_app",
    description: "Apaga um serviço App (o tipo errado que procura Dockerfile na raiz).",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        serviceName: { type: "string" },
      },
      required: ["projectName", "serviceName"],
    },
  },
  {
    name: "create_domain",
    description: "Cria domínio apontando para um serviço Compose interno e porta.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string" },
        serviceName: { type: "string" },
        host: { type: "string" },
        internalService: { type: "string" },
        port: { type: "number" },
      },
      required: ["projectName", "serviceName", "host", "internalService", "port"],
    },
  },
  {
    name: "trpc",
    description: "Chamada tRPC bruta (explorar API do painel).",
    inputSchema: {
      type: "object",
      properties: {
        procedure: { type: "string" },
        input: { type: "object" },
        method: { type: "string", enum: ["GET", "POST"] },
      },
      required: ["procedure"],
    },
  },
];

async function callTool(name, args) {
  const a = args || {};
  switch (name) {
    case "session":
      try {
        return await rest("GET", "/getSession");
      } catch (e) {
        return await trpc("auth.getUser");
      }
    case "list_projects":
      try {
        return await rest("GET", "/listProjects");
      } catch {
        return await trpc("projects.listProjectsAndServices");
      }
    case "inspect_project":
      try {
        return await rest("GET", `/inspectProject?projectName=${encodeURIComponent(a.projectName)}`);
      } catch {
        return await trpc("projects.inspectProject", { projectName: a.projectName });
      }
    case "create_compose":
      try {
        return await rest("POST", "/createComposeService", {
          projectName: a.projectName,
          serviceName: a.serviceName,
        });
      } catch {
        return await trpc("services.compose.createService", {
          projectName: a.projectName,
          serviceName: a.serviceName,
        });
      }
    case "update_compose_github":
      return await trpc("services.compose.updateSource", {
        projectName: a.projectName,
        serviceName: a.serviceName,
        source: {
          type: "github",
          owner: a.owner,
          repo: a.repo,
          ref: a.branch,
          path: a.path || "/",
          composeFile: a.composeFile || "docker-compose.easypanel.yml",
        },
      });
    case "update_compose_env":
      return await trpc("services.compose.updateEnv", {
        projectName: a.projectName,
        serviceName: a.serviceName,
        env: a.env,
        createDotEnv: a.createDotEnv !== false,
      });
    case "deploy_compose":
      try {
        return await rest("POST", "/deployComposeService", {
          projectName: a.projectName,
          serviceName: a.serviceName,
        });
      } catch {
        return await trpc("services.compose.deployService", {
          projectName: a.projectName,
          serviceName: a.serviceName,
        });
      }
    case "destroy_app":
      try {
        return await rest("POST", "/deleteAppService", {
          projectName: a.projectName,
          serviceName: a.serviceName,
        });
      } catch {
        return await trpc("services.app.destroyService", {
          projectName: a.projectName,
          serviceName: a.serviceName,
        });
      }
    case "create_domain":
      return await trpc("domains.createDomain", {
        projectName: a.projectName,
        serviceName: a.serviceName,
        host: a.host,
        path: "/",
        port: a.port,
        https: true,
        internalProtocol: "http",
        composeInternalService: a.internalService,
      });
    case "trpc":
      return await trpc(a.procedure, a.input || {}, a.method);
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

function writeMessage(msg) {
  const json = JSON.stringify(msg);
  const buf = Buffer.from(json, "utf8");
  process.stdout.write(`Content-Length: ${buf.length}\r\n\r\n`);
  process.stdout.write(buf);
}

function ok(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function err(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
  if (!msg || msg.jsonrpc !== "2.0") return;
  const { id, method, params } = msg;
  if (method === "initialize") {
    ok(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "easypanel", version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "initialized") return;
  if (method === "tools/list") {
    ok(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    try {
      const result = await callTool(params.name, params.arguments || {});
      ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (e) {
      ok(id, {
        content: [{ type: "text", text: String(e?.message || e) }],
        isError: true,
      });
    }
    return;
  }
  if (method === "ping") {
    ok(id, {});
    return;
  }
  if (id !== undefined) err(id, -32601, `Method not found: ${method}`);
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    const nlHeader = buffer.indexOf("\n\n");
    let split = -1;
    let sepLen = 4;
    if (headerEnd >= 0) {
      split = headerEnd;
      sepLen = 4;
    } else if (nlHeader >= 0) {
      split = nlHeader;
      sepLen = 2;
    } else {
      const line = buffer.toString("utf8");
      if (line.includes("\n") && line.trim().startsWith("{")) {
        const idx = buffer.indexOf(0x0a);
        const raw = buffer.slice(0, idx).toString("utf8").trim();
        buffer = buffer.slice(idx + 1);
        try {
          handle(JSON.parse(raw));
        } catch {
          /* ignore */
        }
        continue;
      }
      break;
    }
    const header = buffer.slice(0, split).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(split + sepLen);
      continue;
    }
    const len = Number(match[1]);
    const start = split + sepLen;
    if (buffer.length < start + len) break;
    const raw = buffer.slice(start, start + len).toString("utf8");
    buffer = buffer.slice(start + len);
    try {
      handle(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
});
