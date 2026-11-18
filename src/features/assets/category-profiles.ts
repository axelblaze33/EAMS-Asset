// Suggested fields per kind of asset. Categories are user-defined master data,
// so profiles match on the category name (or code) by keyword, like the icons.
// Picking a category in the asset form pre-fills these as specification rows;
// they stay ordinary specifications, so anything can be renamed or removed.

export type SpecField = {
  key: string;
  placeholder?: string;
  /** Pre-filled value, e.g. the camera type implied by the category. */
  value?: string;
  /** Offered as suggestions; any other value is still accepted. */
  options?: string[];
};

export type CategoryProfile = {
  id: string;
  /** Show the license section (license number, seats, expiry) by default. */
  license?: boolean;
  /** Label for the license seats field. */
  seatsLabel?: string;
  specs: SpecField[];
};

const network: SpecField[] = [
  { key: "IP address", placeholder: "192.168.1.10" },
  { key: "MAC address", placeholder: "00:1A:2B:3C:4D:5E" },
  { key: "Installed at", placeholder: "Server room, rack 2" },
];

const camera = (type?: "Dome" | "Bullet"): SpecField[] => [
  { key: "Camera type", value: type, placeholder: "Dome", options: ["Dome", "Bullet", "PTZ", "Turret", "Fisheye"] },
  { key: "Resolution", placeholder: "4 MP", options: ["2 MP (1080p)", "4 MP", "5 MP", "8 MP (4K)"] },
  { key: "Lens", placeholder: "2.8 mm" },
  { key: "Night vision range", placeholder: "30 m" },
  { key: "NVR / channel", placeholder: "NVR-01 / CH 4" },
  ...network,
];

const PROFILES: [RegExp, CategoryProfile][] = [
  [
    /anti-?virus|endpoint|security suite|^av$/i,
    {
      id: "antivirus",
      license: true,
      seatsLabel: "Devices covered",
      specs: [
        { key: "Edition", placeholder: "Endpoint Protection Business" },
        { key: "Installed on", placeholder: "AST-000123, AST-000124" },
        { key: "Console / portal", placeholder: "https://…" },
      ],
    },
  ],
  [
    /licen[cs]e|software|subscription|^swl$/i,
    {
      id: "software",
      license: true,
      seatsLabel: "Seats / users",
      specs: [
        { key: "Edition", placeholder: "Business Standard" },
        { key: "License type", placeholder: "Subscription", options: ["Subscription", "Perpetual", "OEM", "Volume"] },
      ],
    },
  ],
  [
    /\bpoe\b|power over ethernet/i,
    {
      id: "poe-switch",
      specs: [
        { key: "Ports", placeholder: "24" },
        { key: "PoE ports", placeholder: "16" },
        { key: "PoE budget", placeholder: "250 W" },
        { key: "Port speed", placeholder: "1 Gbps", options: ["100 Mbps", "1 Gbps", "2.5 Gbps", "10 Gbps"] },
        { key: "Uplink / SFP ports", placeholder: "2 × SFP" },
        { key: "Managed", options: ["Managed", "Smart / web-managed", "Unmanaged"] },
        ...network,
      ],
    },
  ],
  [
    /switch|^lsw$/i,
    {
      id: "lan-switch",
      specs: [
        { key: "Ports", placeholder: "24" },
        { key: "Port speed", placeholder: "1 Gbps", options: ["100 Mbps", "1 Gbps", "2.5 Gbps", "10 Gbps"] },
        { key: "Uplink / SFP ports", placeholder: "4 × SFP+" },
        { key: "Managed", options: ["Managed", "Smart / web-managed", "Unmanaged"] },
        ...network,
      ],
    },
  ],
  [/dome|^cctv-d$/i, { id: "cctv-dome", specs: camera("Dome") }],
  [/bullet|^cctv-b$/i, { id: "cctv-bullet", specs: camera("Bullet") }],
  [/cctv|camera|nvr|dvr/i, { id: "cctv", specs: camera() }],
  [
    /cable|cord|wire|^cbl$/i,
    {
      id: "cable",
      specs: [
        { key: "Cable type", placeholder: "Cat6", options: ["Cat5e", "Cat6", "Cat6A", "Fiber (single-mode)", "Fiber (multi-mode)", "HDMI", "DisplayPort", "USB-C", "Power", "Coaxial"] },
        { key: "Length", placeholder: "3 m" },
        { key: "Quantity", placeholder: "20 pcs / 305 m box" },
        { key: "Connector", placeholder: "RJ45" },
        { key: "Colour", placeholder: "Blue" },
        { key: "Installed at", placeholder: "2nd floor patch panel" },
      ],
    },
  ],
];

/** Profile for a category, matched on its name first, then its code. */
export function categoryProfile(name?: string | null, code?: string | null): CategoryProfile | null {
  for (const value of [name, code]) {
    if (!value) continue;
    const hit = PROFILES.find(([re]) => re.test(value));
    if (hit) return hit[1];
  }
  return null;
}

type SpecRow = { key: string; value: string };

/**
 * Adds the profile's fields that aren't already present. Rows without a value
 * (unused suggestions from a previous category) are dropped first; rows with
 * a value are always kept, so switching categories never loses what was typed.
 */
export function withProfileSpecs(rows: SpecRow[], profile: CategoryProfile | null): SpecRow[] {
  const filled = rows.filter((r) => r.value.trim());
  if (!profile) return filled.length ? filled : [{ key: "", value: "" }];
  const have = new Set(filled.map((r) => r.key.trim().toLowerCase()));
  const added = profile.specs.filter((s) => !have.has(s.key.toLowerCase())).map((s) => ({ key: s.key, value: s.value ?? "" }));
  return [...filled, ...added];
}
