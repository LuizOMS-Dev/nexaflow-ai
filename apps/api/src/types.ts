import type { MemberRole, PlatformRole } from "@prisma/client";

/**
 * Payload JWT da API — fonte única (alinha com plugins/auth JwtUser).
 * sid/jti = sessão; imp/impBy = impersonação.
 */
export type JwtPayload = {
  sub: string;
  email?: string;
  name?: string;
  platformRole?: PlatformRole | string | null;
  tenantId?: string | null;
  role?: MemberRole | null;
  sid?: string;
  jti?: string;
  iss?: string;
  aud?: string | string[];
  imp?: boolean;
  impBy?: string | null;
};

/** Alias legado / compat */
export type AuthedUser = JwtPayload & {
  userId: string;
};

// Augmentation canônica em plugins/auth.ts (JwtUser).
// Não redeclarar FastifyJWT aqui para evitar conflito de tipos.
