export type Role = "creator" | "lp" | "collector";

export const CREATOR_LINKS = [
  {href: "/launch", label: "Launchpad"},
  {href: "/creator", label: "Studio"},
  {href: "/dispute", label: "Disputes"},
];

export const LP_LINKS = [
  {href: "/pools", label: "Available Pools"},
  {href: "/portfolio", label: "Portfolio"},
  {href: "/dispute", label: "Disputes"},
];

export const COLLECTOR_LINKS = [
  {href: "/market", label: "Marketplace"},
  {href: "/portfolio", label: "Portfolio"},
];

export const LINKS_BY_ROLE = {
  creator: CREATOR_LINKS,
  lp: LP_LINKS,
  collector: COLLECTOR_LINKS,
} as const;

// Where each role lands when it has no remembered "last path" yet.
export const DEFAULT_PATH_BY_ROLE: Record<Role, string> = {
  creator: "/launch",
  lp: "/pools",
  collector: "/market",
};

// Path prefixes each role is allowed to own. Includes detail sub-routes that
// never appear in the top nav (e.g. /pool/[id], /trade/[id], /creator/[address],
// /attest). A path may belong to more than one role when the page is shared
// (e.g. /portfolio is for both LP and Collector; /dispute for Creator and LP).
const ROLE_ROUTE_PREFIXES: Record<Role, string[]> = {
  creator: ["/launch", "/creator", "/attest", "/dispute"],
  lp: ["/pools", "/pool", "/portfolio", "/dispute"],
  collector: ["/market", "/trade", "/portfolio"],
};

/**
 * Returns true when `pathname` is a page that belongs to `role`. Used to keep
 * each role's remembered "last path" clean: we never store a path under a role
 * it does not own, and we never restore a role onto another role's page.
 */
export function pathBelongsToRole(pathname: string, role: Role): boolean {
  return ROLE_ROUTE_PREFIXES[role].some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
