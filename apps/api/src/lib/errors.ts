export class AppError extends Error {
  statusCode: number;
  code: string;
  /** Metadados opcionais de domínio (ex.: contactId em conflito de telefone) */
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 400,
    code = "BAD_REQUEST",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function assertFound<T>(value: T | null | undefined, message = "Não encontrado"): T {
  if (value == null) throw new AppError(message, 404, "NOT_FOUND");
  return value;
}
