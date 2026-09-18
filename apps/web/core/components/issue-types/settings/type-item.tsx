/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Switch } from "@makeplane/propel/components/switch";
import { ChevronDown, Plus } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TIssueType } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { IssuePropertySettingsItem } from "./property-item";
import { IssuePropertyModal } from "./property-modal";
import { IssueTypeModal } from "./type-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueType: TIssueType;
  isAdmin: boolean;
  defaultOpen?: boolean;
};

export const IssueTypeSettingsItem = observer(function IssueTypeSettingsItem(props: Props) {
  const { workspaceSlug, projectId, issueType, isAdmin, defaultOpen = false } = props;
  // store hooks
  const { getPropertiesByIssueTypeId, updateIssueType, deleteIssueType } = useIssueTypes();
  // states
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPropertyModalOpen, setIsPropertyModalOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // derived values
  const properties = getPropertiesByIssueTypeId(issueType.id);
  const activeCount = properties.filter((property) => property.is_active).length;

  const handleSetDefault = async () => {
    try {
      await updateIssueType(workspaceSlug, projectId, issueType.id, { is_default: true });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: `${issueType.name} is now the default type.` });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to update the work item type." });
    }
  };

  const handleToggleActive = async (checked: boolean) => {
    try {
      await updateIssueType(workspaceSlug, projectId, issueType.id, { is_active: checked });
    } catch (error: unknown) {
      const message = (error as { is_active?: string[] })?.is_active?.[0];
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: message ?? "Failed to update the work item type." });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteIssueType(workspaceSlug, projectId, issueType.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Work item type deleted." });
      setIsDeleteOpen(false);
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error;
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: message ?? "Failed to delete the work item type." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <IssueTypeModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        issueType={issueType}
      />
      <IssuePropertyModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueTypeId={issueType.id}
        isOpen={isPropertyModalOpen}
        onClose={() => setIsPropertyModalOpen(false)}
      />
      <AlertModalCore
        isOpen={isDeleteOpen}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title="Delete this type"
        content={
          <>
            Deleting <span className="font-medium text-primary">{issueType.name}</span> moves its work items to the
            default type and permanently removes their custom property values.
          </>
        }
        variant="danger"
      />
      <div className={cn("rounded-lg border-[0.5px] border-subtle bg-surface-1", !issueType.is_active && "opacity-70")}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex min-w-0 grow items-center gap-3 text-left"
            aria-expanded={isOpen}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-layer-transparent">
              <Logo logo={issueType.logo_props} size={16} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate text-body-sm-medium text-primary">{issueType.name}</span>
                {issueType.is_default && (
                  <span className="rounded-sm bg-accent-primary/15 px-1.5 py-0.5 text-caption-sm-medium text-accent-primary">
                    Default
                  </span>
                )}
                {!issueType.is_active && (
                  <span className="rounded-sm bg-layer-transparent px-1.5 py-0.5 text-caption-sm-medium text-tertiary">
                    Inactive
                  </span>
                )}
              </span>
              <span className="truncate text-caption-sm-regular text-tertiary">
                {issueType.description || `${activeCount} ${activeCount === 1 ? "property" : "properties"}`}
              </span>
            </span>
          </button>
          {isAdmin && (
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                size="sm"
                checked={issueType.is_active}
                onCheckedChange={(checked: boolean) => void handleToggleActive(checked)}
                disabled={issueType.is_default}
                aria-label="Active"
              />
              <CustomMenu ellipsis placement="bottom-end" closeOnSelect>
                <CustomMenu.MenuItem onClick={() => setIsEditOpen(true)}>Edit</CustomMenu.MenuItem>
                {!issueType.is_default && (
                  <CustomMenu.MenuItem onClick={() => void handleSetDefault()} disabled={!issueType.is_active}>
                    Set as default
                  </CustomMenu.MenuItem>
                )}
                {!issueType.is_default && (
                  <CustomMenu.MenuItem onClick={() => setIsDeleteOpen(true)} className="text-danger-primary">
                    Delete
                  </CustomMenu.MenuItem>
                )}
              </CustomMenu>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded-sm p-1 text-tertiary hover:bg-layer-transparent-hover"
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
          </button>
        </div>
        {isOpen && (
          <div className="border-t-[0.5px] border-subtle px-2 py-2">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-caption-sm-medium text-tertiary uppercase">Custom properties</span>
              {isAdmin && (
                <Button
                  variant="link"
                  size="sm"
                  prependIcon={<Plus className="size-3.5" />}
                  onClick={() => setIsPropertyModalOpen(true)}
                >
                  Add new property
                </Button>
              )}
            </div>
            {properties.length === 0 ? (
              <p className="px-2 py-3 text-body-xs-regular text-tertiary">
                No custom properties yet. Add one to collect structured data on every work item of this type.
              </p>
            ) : (
              <div className="flex flex-col">
                {properties.map((property) => (
                  <IssuePropertySettingsItem
                    key={property.id}
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    property={property}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
});
