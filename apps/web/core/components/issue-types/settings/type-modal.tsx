/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { EmojiIconPickerTypes, EmojiPicker, Logo } from "@plane/propel/emoji-icon-picker";
import type { TChangeHandlerProps } from "@plane/propel/emoji-icon-picker";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TIssueType, TLogoProps } from "@plane/types";
import { Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  /** When set, the modal edits this type; otherwise it creates one. */
  issueType?: TIssueType;
};

const DEFAULT_LOGO: TLogoProps = {
  in_use: "icon",
  icon: { name: "category", color: "#6695FF", background_color: "#E5EAFF" },
};

export const IssueTypeModal = observer(function IssueTypeModal(props: Props) {
  const { workspaceSlug, projectId, isOpen, onClose, issueType } = props;
  // store hooks
  const { createIssueType, updateIssueType } = useIssueTypes();
  // states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<TLogoProps>(DEFAULT_LOGO);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!issueType;

  useEffect(() => {
    if (!isOpen) return;
    setName(issueType?.name ?? "");
    setDescription(issueType?.description ?? "");
    setLogo(issueType?.logo_props?.in_use ? issueType.logo_props : DEFAULT_LOGO);
    setError(null);
  }, [isOpen, issueType]);

  const handleLogoChange = (val: TChangeHandlerProps) => {
    if (val.type === EmojiIconPickerTypes.EMOJI) setLogo({ in_use: "emoji", emoji: { value: val.value } });
    else setLogo({ in_use: "icon", icon: { ...val.value, background_color: logo.icon?.background_color } });
    setIsPickerOpen(false);
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give this work item type a name.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: Partial<TIssueType> = { name: trimmed, description: description.trim(), logo_props: logo };
      if (isEdit && issueType) {
        await updateIssueType(workspaceSlug, projectId, issueType.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: `Work item type ${trimmed} updated.` });
      } else {
        await createIssueType(workspaceSlug, projectId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Work item type created." });
      }
      onClose();
    } catch (err: unknown) {
      const data = (err ?? {}) as { name?: string[]; error?: string };
      setError(data.name?.[0] ?? data.error ?? "Failed to save the work item type. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose}>
      <div className="space-y-5 p-5">
        <h3 className="text-h4-medium text-secondary">{isEdit ? "Update work item type" : "Create work item type"}</h3>
        <div className="flex items-start gap-3">
          <EmojiPicker
            iconType="material"
            isOpen={isPickerOpen}
            handleToggle={(val: boolean) => setIsPickerOpen(val)}
            className="flex items-center justify-center"
            buttonClassName="flex items-center justify-center"
            label={
              <span className="grid size-10 place-items-center rounded-md border border-subtle bg-layer-2">
                <Logo logo={logo} size={20} />
              </span>
            }
            onChange={handleLogoChange}
            defaultIconColor={logo.in_use === "icon" ? logo.icon?.color : undefined}
            defaultOpen={logo.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
          />
          <div className="grow space-y-3">
            <div className="space-y-1">
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Give this work item type a unique name"
                hasError={!!error}
                className="w-full"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSubmit();
                }}
              />
              {error && <p className="text-caption-sm-regular text-danger-primary">{error}</p>}
            </div>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this work item type is meant for and when it's to be used."
              className="w-full resize-none"
              textAreaSize="sm"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleSubmit()} loading={isSubmitting}>
            {isSubmitting ? "Saving" : isEdit ? "Update work item type" : "Add work item type"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
