// FILE: InlineLinkChip.tsx
// Purpose: Shared inline link chip for the composer, sent user messages, and any
//          read-only prompt echo — same label shortening, favicon icon, and
//          accent styling everywhere.
// Layer: Shared UI component

import { memo, type MouseEvent } from "react";

import { describeLinkChip, openExternalLink } from "~/lib/linkChips";
import { LinkChipIcon } from "./LinkChipIcon";

export interface InlineLinkChipProps {
  readonly url: string;
  readonly interactive?: boolean;
  readonly className?: string | undefined;
}

const COMPOSER_INLINE_LINK_CHIP_CLASS_NAME =
  "composer-inline-chip inline-flex items-center gap-1 rounded-md bg-accent/60 px-1.5 py-0.5 text-[length:var(--app-font-size-ui-xs,11px)] leading-none text-accent-foreground no-underline hover:bg-accent cursor-pointer";
const COMPOSER_INLINE_CHIP_INLINE_ICON_CLASS_NAME = "size-3 shrink-0";
const COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME = "truncate max-w-[18ch]";

export const InlineLinkChip = memo(function InlineLinkChip({
  url,
  interactive = false,
  className,
}: InlineLinkChipProps) {
  const { label } = describeLinkChip(url);
  const chipClassName = className ?? COMPOSER_INLINE_LINK_CHIP_CLASS_NAME;

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openExternalLink(url);
  };

  const content = (
    <>
      <LinkChipIcon url={url} className={COMPOSER_INLINE_CHIP_INLINE_ICON_CLASS_NAME} />
      <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
    </>
  );

  if (interactive) {
    return (
      <button type="button" className={chipClassName} title={url} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <span
      className={chipClassName}
      title={url}
      contentEditable={false}
      suppressContentEditableWarning
      spellCheck={false}
      onClick={onClick}
      role="link"
    >
      {content}
    </span>
  );
});
