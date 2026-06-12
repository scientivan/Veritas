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
