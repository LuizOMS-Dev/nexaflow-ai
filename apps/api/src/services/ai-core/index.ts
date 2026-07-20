/**
 * NexaFlow AI Core — API pública interna.
 */
export * from "./types";
export * from "./catalog";
export { looksLikeProviderKey } from "./credentials";
export { getAdapter } from "./registry";
export { resolveAiRuntime, resolveModelForProvider, loadTenantAiConfig } from "./resolve-config";
export {
  generateText,
  generateForScope,
  testConnection,
  describeRuntime,
  AiGatewayError,
} from "./gateway";
