/** Active state for admin/platform nav (exact root, prefix for children). */
export function isAdminNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // /admin exact — don't mark active on /admin/companies
  if (href === "/admin" || href === "/app") return false;
  // Companies covers tenant detail routes
  if (href === "/admin/companies") {
    return (
      pathname.startsWith("/admin/companies") || pathname.startsWith("/admin/tenants")
    );
  }
  return pathname.startsWith(href);
}
