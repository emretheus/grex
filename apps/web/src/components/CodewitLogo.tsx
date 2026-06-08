// FILE: CodewitLogo.tsx
// Purpose: Render the Codewit mark (C + >) as an inline SVG that follows the
//          theme foreground color, so it reads cleanly on both light and dark
//          surfaces. The full-color version lives in the OS/app icon artwork.
// Layer: Shared app branding primitive

import type { SVGProps } from "react";
import {
  CODEWIT_LOGO_PATHS,
  CODEWIT_LOGO_TRANSFORM,
  CODEWIT_LOGO_VIEWBOX,
} from "~/assets/codewitLogoPath";
import { cn } from "~/lib/utils";

export function CodewitLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  const ariaLabel = props["aria-label"];

  return (
    <svg
      viewBox={CODEWIT_LOGO_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaLabel ? undefined : true}
      {...props}
      className={cn("shrink-0 text-foreground", className)}
    >
      <g transform={CODEWIT_LOGO_TRANSFORM} fill="currentColor" stroke="none">
        {CODEWIT_LOGO_PATHS.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
    </svg>
  );
}
