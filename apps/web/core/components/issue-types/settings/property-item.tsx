/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Switch } from "@plane/propel/switch";
import { Pencil, Trash2 } from "lucide-react";
// plane imports
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssuePropertyType } from "@plane/types";
import type { TIssueProperty } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { ISSUE_PROPERTY_TYPE_LABELS } from "../helpers";
import { IssuePropertyTypeIcon } from "../property-icon";
import { IssuePropertyModal } from "./property-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  property: TIssueProperty;
  isAdmin: boolean;
};

export const IssuePropertySettingsItem = observer(function IssuePropertySettingsItem(props: Props) {
  const { workspaceSlug, projectId, property, isAdmin } = props;
  // store hooks
  const { updateIssueProperty, deleteIssueProperty } = useIssueTypes();
  // states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // derived values
  const typeLabel = ISSUE_PROPERTY_TYPE_LABELS[property.property_type];
  const details = [
    typeLabel,
    property.is_multi ? "Multi" : null,
    property.property_type === EIssuePropertyType.OPTION ? `${property.options?.length ?? 0} options` : null,
    property.is_required ? "Mandatory" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleToggleActive = async (checked: boolean) => {
    try {
      await updateIssueProperty(workspaceSlug, projectId, property.id, { is_active: checked });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to update the property. Please try again.",
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteIssueProperty(workspaceSlug, projectId, property.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: `Property ${property.display_name} deleted.` });
      setIsDeleteOpen(false);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to delete the property. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <IssuePropertyModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueTypeId={property.issue_type}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        property={property}
      />
      <AlertModalCore
        isOpen={isDeleteOpen}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title="Delete this property"
        content={
          <>
            Deleting <span className="font-medium text-primary">{property.display_name}</span> permanently removes its
            values from every work item. Consider disabling it instead.
          </>
        }
        variant="danger"
      />
      <div
        className={cn(
          "group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-layer-transparent-hover",
          !property.is_active && "opacity-60"
        )}
      >
        <IssuePropertyTypeIcon propertyType={property.property_type} className="size-4 text-tertiary" />
        <div className="flex min-w-0 grow flex-col">
          <span className="truncate text-body-xs-medium text-primary">
            {property.display_name}
            {property.is_required && <span className="ml-0.5 text-danger-primary">*</span>}
          </span>
          <span className="truncate text-caption-sm-regular text-tertiary">{details}</span>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip tooltipContent={property.is_active ? "Click to disable" : "Click to enable"}>
              <div className="flex items-center">
                <Switch
                  size="sm"
                  value={property.is_active}
                  onChange={(checked: boolean) => void handleToggleActive(checked)}
                  aria-label="Active"
                />
              </div>
            </Tooltip>
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="rounded-sm p-1 text-tertiary opacity-0 group-hover:opacity-100 hover:bg-layer-transparent-hover hover:text-primary"
              aria-label="Edit property"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsDeleteOpen(true)}
              className="rounded-sm p-1 text-tertiary opacity-0 group-hover:opacity-100 hover:bg-layer-transparent-hover hover:text-danger-primary"
              aria-label="Delete property"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
});
