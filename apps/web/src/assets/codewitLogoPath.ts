// FILE: codewitLogoPath.ts
// Purpose: Single-color vector geometry for the Codewit mark (C + >), traced from
//          the canonical app-icon artwork. Rendered with currentColor so the mark
//          follows the active theme foreground (white on dark, dark on light).
// Layer: Shared app branding constants

// viewBox is 758x758; paths are emitted in potrace's flipped/scaled coordinate
// space, so they are drawn inside a <g> with the matching transform.
export const CODEWIT_LOGO_VIEWBOX = "0 0 758 758";
export const CODEWIT_LOGO_TRANSFORM = "translate(0,758) scale(0.1,-0.1)";

export const CODEWIT_LOGO_PATHS = [
  "M633 5948 l-633 -632 0 -1526 0 -1525 628 -628 628 -628 1688 0 c929 0 1691 3 1694 6 3 3 -28 40 -69 83 -145 151 -637 669 -745 784 l-109 117 -1037 1 -1037 0 -320 316 -321 316 0 1157 0 1156 323 323 322 322 1036 0 1037 0 37 43 c40 44 440 466 723 761 89 94 162 174 162 178 0 4 -759 8 -1687 8 l-1688 0 -632 -632z",
  "M4623 5677 c-77 -89 -197 -228 -267 -310 -70 -81 -126 -152 -124 -157 7 -20 1384 -1021 1935 -1406 l72 -51 -432 -320 c-505 -375 -1005 -744 -1339 -986 -131 -95 -238 -175 -238 -178 0 -6 55 -69 417 -471 63 -71 117 -128 119 -128 2 0 230 167 506 372 1015 750 1736 1279 2170 1593 100 72 138 106 137 120 0 15 -90 85 -327 257 -493 358 -1373 1004 -2202 1618 -146 108 -270 199 -276 203 -7 4 -68 -59 -151 -156z",
] as const;
