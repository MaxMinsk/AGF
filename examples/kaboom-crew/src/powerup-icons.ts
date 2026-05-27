// S148 KABOOM-POWERUP-HUD-ICONS — procedural SVG icons for power-up HUD.
//
// Each power-up kind has a mono-cream silhouette built from primitive
// SVG shapes (rect / circle / path). Per docs/game-design/visual-style.md
// §8.3: industrial palette, hard edges, no rounded corners, no emoji.
//
// The icons render at 24×24 px in the HUD grid (S148 HUD-GRID-001) and
// at 96×96 px in the centre-screen tooltip (S148 TOOLTIP-001) — same
// SVG, different container size; the viewBox + stroke-width scale.
//
// Why inline SVG strings instead of files: keeps the kaboom-crew project
// dependency-free (no asset pipeline change for icons), and lets the
// existing HUD widget DOM contract (render(data) → HTMLElement) keep
// the icons hot-reloadable.

export type PowerupIconKind =
  | "bomb"
  | "fire"
  | "speed"
  | "kick"
  | "remote"
  | "shield"
  | "pierce"
  | "throw-glove";

// Cream silhouette per visual-style.md §8.3. Same colour for every icon;
// active/inactive state is driven by container CSS (opacity + glow), not
// by recolouring the path.
const ICON_FILL = "#f4e9d3";
const ICON_STROKE = "#0a0a0a";

/**
 * Returns the inner SVG markup (without `<svg>` wrapper) for a power-up
 * icon. The HUD layer wraps it in a sized <svg viewBox="0 0 24 24">
 * element. Each icon is designed to read as a recognisable silhouette
 * at 24×24 with a 1.5 px stroke.
 */
export function powerupIconSvgInner(kind: PowerupIconKind): string {
  switch (kind) {
    case "bomb":
      // Round bomb body + short fuse stem + small spark dot.
      return [
        `<circle cx="12" cy="14" r="6" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<rect x="11" y="5" width="2" height="4" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1"/>`,
        `<circle cx="12" cy="4" r="1.4" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="0.8"/>`
      ].join("");
    case "fire":
      // Tall flame teardrop with a notch.
      return [
        `<path d="M12 3 C8 9 6 13 6 16 C6 19 9 21 12 21 C15 21 18 19 18 16 C18 13 16 9 12 3 Z" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<path d="M12 11 C10 14 10 16 12 17 C14 16 14 14 12 11 Z" fill="${ICON_STROKE}" opacity="0.35"/>`
      ].join("");
    case "speed":
      // Tall narrow boot silhouette — base + ankle column.
      return [
        `<rect x="5" y="16" width="14" height="4" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<rect x="8" y="4" width="5" height="14" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`
      ].join("");
    case "kick":
      // Short fat boot with motion impact lines.
      return [
        `<rect x="3" y="14" width="14" height="5" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<rect x="5" y="6" width="6" height="10" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<line x1="19" y1="10" x2="22" y2="10" stroke="${ICON_FILL}" stroke-width="1.5"/>`,
        `<line x1="19" y1="14" x2="22" y2="14" stroke="${ICON_FILL}" stroke-width="1.5"/>`,
        `<line x1="19" y1="18" x2="22" y2="18" stroke="${ICON_FILL}" stroke-width="1.5"/>`
      ].join("");
    case "remote":
      // Trigger button — rectangle base + circular plunger on top.
      return [
        `<rect x="5" y="12" width="14" height="7" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<rect x="10" y="7" width="4" height="6" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<circle cx="12" cy="5" r="2.5" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`
      ].join("");
    case "shield":
      // Heater shield silhouette — wide top, tapering bottom.
      return [
        `<path d="M12 3 L20 6 L20 12 C20 17 16 20 12 21 C8 20 4 17 4 12 L4 6 Z" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`,
        `<line x1="8" y1="10" x2="16" y2="10" stroke="${ICON_STROKE}" stroke-width="1.2"/>`,
        `<line x1="12" y1="6" x2="12" y2="17" stroke="${ICON_STROKE}" stroke-width="1.2"/>`
      ].join("");
    case "pierce":
      // Arrow / spear — diamond head + shaft.
      return [
        `<path d="M12 2 L18 8 L14 8 L14 22 L10 22 L10 8 L6 8 Z" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`
      ].join("");
    case "throw-glove":
      // Glove — palm + extended thumb silhouette.
      return [
        `<path d="M6 10 L6 18 C6 20 7 21 9 21 L17 21 C19 21 20 20 20 18 L20 12 L18 12 L18 8 L15 8 L15 12 L13 12 L13 6 L10 6 L10 12 L8 12 L8 10 Z" fill="${ICON_FILL}" stroke="${ICON_STROKE}" stroke-width="1.5"/>`
      ].join("");
  }
}

/**
 * Build a complete <svg> element for a power-up icon at the given size.
 * Containers may further style the wrapper (active glow, desaturation),
 * but the inner geometry stays identical.
 */
export function createPowerupIconSvg(kind: PowerupIconKind, sizePx: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(sizePx));
  svg.setAttribute("height", String(sizePx));
  svg.innerHTML = powerupIconSvgInner(kind);
  return svg;
}

/** Tooltip label per pickup-kind. Matched 1:1 to the pickup-spawn-system PickupKind union. */
export const PICKUP_TOOLTIP_LABEL: Record<string, string> = {
  "bomb-up": "BOMB UP",
  "fire-up": "FIRE UP",
  "speed-up": "SPEED UP",
  "kick": "KICK",
  "remote-detonate": "REMOTE",
  "shield": "SHIELD",
  "pierce": "PIERCE",
  "throw-glove": "THROW GLOVE"
};

/** Pickup-kind → icon mapping for the tooltip layer. */
export const PICKUP_ICON: Record<string, PowerupIconKind> = {
  "bomb-up": "bomb",
  "fire-up": "fire",
  "speed-up": "speed",
  "kick": "kick",
  "remote-detonate": "remote",
  "shield": "shield",
  "pierce": "pierce",
  "throw-glove": "throw-glove"
};
