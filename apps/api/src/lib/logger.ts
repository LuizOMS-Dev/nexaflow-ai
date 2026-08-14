/** Remove credenciais de query strings antes de enviar URLs para logs. */
export function sanitizeRequestUrl(rawUrl: string): string {
  return rawUrl.replace(
    /([?&](?:token|access_token|api_key)=)[^&]*/gi,
    "$1[redacted]"
  );
}
