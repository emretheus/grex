// FILE: EnvironmentEditorSection.tsx
// Purpose: "Editor" section of the Environment panel — one picker row ("Open in <editor>")
//          with a trailing chevron, same skin as Commit and Push / env pickers. The menu
//          lists every installed editor (same entries as the header OpenInPicker).
// Layer: Environment panel section

import type { EditorId, ResolvedKeybindingsConfig } from "@t3tools/contracts";

import { useEditorLaunchers } from "~/hooks/useEditorLaunchers";
import { Columns2Icon } from "~/lib/icons";

import { ComposerPickerMenuPopup } from "../ComposerPickerMenuPopup";
import { Menu, MenuItem, MenuShortcut, MenuTrigger } from "../../ui/menu";
import {
  ENVIRONMENT_ROW_CLASS_NAME,
  ENVIRONMENT_ROW_ICON_CLASS_NAME,
  EnvironmentRow,
  EnvironmentRowBody,
  EnvironmentRowChevron,
  EnvironmentSectionLabel,
} from "./EnvironmentRow";

export function EnvironmentEditorSection({
  keybindings,
  availableEditors,
  openInCwd,
  onOpenEditorView,
}: {
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  openInCwd: string | null;
  /** When provided, the section shows an "Editor view" row that opens the
   *  full-screen editor workspace. */
  onOpenEditorView?: () => void;
}) {
  const { options, preferredEditor, primaryOption, openFavoriteShortcutLabel, openInEditor } =
    useEditorLaunchers({
      keybindings,
      availableEditors,
      openInCwd,
    });

  // The "Editor view" row stands alone even when no external editors are
  // installed, so the section renders if either affordance is available.
  if (options.length === 0 && !onOpenEditorView) {
    return null;
  }

  const activeOption = primaryOption ?? options[0] ?? null;
  const ActiveIcon = activeOption?.Icon;

  return (
    <div className="flex flex-col gap-0.5">
      <EnvironmentSectionLabel>Editor</EnvironmentSectionLabel>
      {onOpenEditorView ? (
        <EnvironmentRow
          icon={<Columns2Icon aria-hidden className={ENVIRONMENT_ROW_ICON_CLASS_NAME} />}
          label="Editor view"
          onClick={onOpenEditorView}
        />
      ) : null}
      {options.length === 0 ? null : (
        <Menu>
          <MenuTrigger
            disabled={!openInCwd}
            render={<button type="button" className={ENVIRONMENT_ROW_CLASS_NAME} />}
          >
            <EnvironmentRowBody
              icon={
                ActiveIcon ? (
                  <ActiveIcon aria-hidden className={ENVIRONMENT_ROW_ICON_CLASS_NAME} />
                ) : null
              }
              label={activeOption ? `Open in ${activeOption.label}` : "Open in editor"}
              trailing={<EnvironmentRowChevron />}
            />
          </MenuTrigger>
          <ComposerPickerMenuPopup align="start" side="bottom" className="w-44 min-w-44">
            {options.map(({ label, Icon, value }) => (
              <MenuItem key={value} onClick={() => openInEditor(value)}>
                <span className="shrink-0">
                  <Icon aria-hidden className="size-3.5 text-muted-foreground" />
                </span>
                {label}
                {value === preferredEditor && openFavoriteShortcutLabel ? (
                  <MenuShortcut>{openFavoriteShortcutLabel}</MenuShortcut>
                ) : null}
              </MenuItem>
            ))}
          </ComposerPickerMenuPopup>
        </Menu>
      )}
    </div>
  );
}
