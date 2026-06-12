// FILE: LinkChipIcon.tsx
// Purpose: Single source of truth for a link's leading icon — the GitHub mark for
//          GitHub URLs, the site favicon otherwise.
// Layer: Shared UI component

import { GitHubIcon } from "~/lib/icons";
import { describeLinkChip } from "~/lib/linkChips";
import { SiteFavicon } from "./SiteFavicon";

export interface LinkChipIconProps {
  readonly url: string;
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

export function LinkChipIcon({ url, size, className }: LinkChipIconProps) {
  const { isGitHub } = describeLinkChip(url);
  if (isGitHub) {
    const style = size === undefined ? undefined : { width: `${size}px`, height: `${size}px` };
    return <GitHubIcon aria-hidden="true" className={className} style={style} />;
  }
  return <SiteFavicon url={url} size={size} className={className} />;
}
