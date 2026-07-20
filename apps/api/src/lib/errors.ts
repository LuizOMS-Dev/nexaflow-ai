export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function assertFound<T>(value: T | null | undefined, message = "Não encontrado"): T {
  if (value == null) throw new AppError(message, 404, "NOT_FOUND");
  return value;
}
