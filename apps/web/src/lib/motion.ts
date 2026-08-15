/**
 * Gerenciamento centralizado de redução de movimento e animações.
 * Prioridade: se o SO pedir redução OU o usuário ativar, reduz o movimento.
 */

export function isReduceMotionEffective(manualPref?: boolean): boolean {
  if (manualPref === true) return true;
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return true;
  }
  return false;
}

export function applyReduceMotion(manualPref?: boolean): boolean {
  const effective = isReduceMotionEffective(manualPref);
  if (typeof document !== "undefined" && document.documentElement) {
    if (effective) {
      document.documentElement.setAttribute("data-reduce-motion", "true");
    } else {
      document.documentElement.removeAttribute("data-reduce-motion");
    }
  }
  return effective;
}
