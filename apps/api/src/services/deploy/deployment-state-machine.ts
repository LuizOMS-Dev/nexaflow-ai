/**
 * Máquina de Estados Server-Side para Ciclo de Vida de Implantações (Deployment State Machine)
 * 
 * Estados Canônicos:
 * - PENDING: Criação e pré-validação da intenção de deploy
 * - PREPARING: Resolução de SHA imutável e lock de concorrência
 * - TRIGGERING: Disparo da ordem de compilação/deploy no EasyPanel
 * - BUILDING: Compilação dos containers Docker em andamento
 * - DEPLOYING: Inicialização e reinicialização dos containers
 * - VERIFYING (ou VALIDATING): Execução de Health Checks granulares (API + Web)
 * - RECONCILING: Estado transitório de auto-reconciliação pós-restart ou timeout de gateway
 * - SUCCESS (ou COMPLETED): Deploy verificado e ativo em produção (Estado Final)
 * - FAILED: Falha em qualquer etapa anterior (Estado Final)
 */

import { AppError } from "../../lib/errors";

export type CanonicalDeploymentStatus =
  | "PENDING"
  | "PREPARING"
  | "TRIGGERING"
  | "BUILDING"
  | "DEPLOYING"
  | "VERIFYING"
  | "RECONCILING"
  | "SUCCESS"
  | "FAILED";

// Aliases para compatibilidade com o schema existente e frontend
export type DeploymentStatusAlias = "VALIDATING" | "COMPLETED";

export type AnyDeploymentStatus = CanonicalDeploymentStatus | DeploymentStatusAlias;

/**
 * Normaliza status para a forma canônica
 */
export function normalizeDeploymentStatus(status: string): CanonicalDeploymentStatus {
  const upper = (status || "").trim().toUpperCase();
  if (upper === "VALIDATING") return "VERIFYING";
  if (upper === "COMPLETED") return "SUCCESS";
  if (
    upper === "PENDING" ||
    upper === "PREPARING" ||
    upper === "TRIGGERING" ||
    upper === "BUILDING" ||
    upper === "DEPLOYING" ||
    upper === "VERIFYING" ||
    upper === "RECONCILING" ||
    upper === "SUCCESS" ||
    upper === "FAILED"
  ) {
    return upper as CanonicalDeploymentStatus;
  }
  return "PENDING";
}

/**
 * Mapeia status canônico para valor persistível no banco de dados (schema Prisma)
 */
export function toDatabaseStatus(status: CanonicalDeploymentStatus): string {
  if (status === "SUCCESS") return "COMPLETED";
  if (status === "VERIFYING") return "VALIDATING";
  return status;
}

/**
 * Tabela de transições legais permitidas entre estados
 */
const LEGAL_TRANSITIONS: Record<CanonicalDeploymentStatus, Set<CanonicalDeploymentStatus>> = {
  PENDING: new Set(["PREPARING", "TRIGGERING", "FAILED"]),
  PREPARING: new Set(["TRIGGERING", "BUILDING", "FAILED"]),
  TRIGGERING: new Set(["BUILDING", "DEPLOYING", "RECONCILING", "FAILED"]),
  BUILDING: new Set(["DEPLOYING", "VERIFYING", "RECONCILING", "FAILED"]),
  DEPLOYING: new Set(["VERIFYING", "RECONCILING", "FAILED"]),
  VERIFYING: new Set(["SUCCESS", "FAILED"]),
  RECONCILING: new Set(["BUILDING", "DEPLOYING", "VERIFYING", "SUCCESS", "FAILED"]),
  SUCCESS: new Set([]), // Estado final
  FAILED: new Set([]),  // Estado final
};

export class DeploymentStateMachine {
  /**
   * Verifica se uma transição de estado é válida
   */
  static isValidTransition(current: string, next: string): boolean {
    const from = normalizeDeploymentStatus(current);
    const to = normalizeDeploymentStatus(next);

    // Mesma etapa é idempotente/permitida
    if (from === to) return true;

    const allowed = LEGAL_TRANSITIONS[from];
    return allowed ? allowed.has(to) : false;
  }

  /**
   * Assegura que uma transição de estado é legal ou lança erro semântico
   */
  static assertTransition(current: string, next: string, deploymentId?: string): CanonicalDeploymentStatus {
    const from = normalizeDeploymentStatus(current);
    const to = normalizeDeploymentStatus(next);

    if (!this.isValidTransition(from, to)) {
      throw new AppError(
        `Transição de estado de deploy inválida: ${from} → ${to}${deploymentId ? ` (deployment: ${deploymentId})` : ""}`,
        400,
        "INVALID_STATE_TRANSITION"
      );
    }

    return to;
  }

  /**
   * Retorna se um status representa um deploy atualmente ativo/em execução
   */
  static isActiveStatus(status: string): boolean {
    const canonical = normalizeDeploymentStatus(status);
    return canonical !== "SUCCESS" && canonical !== "FAILED";
  }
}
