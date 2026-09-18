/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TIssuePropertyValue } from "@plane/types";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { validatePropertyValues } from "../helpers";
import { IssuePropertyTypeIcon } from "../property-icon";
import { PropertyValueInput } from "./property-value-input";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Custom property rows for the work item detail sidebar and peek overview.
 * Renders nothing when the project has no work item types or the type has no
 * active properties, so the surrounding layout is unaffected.
 */
export const IssueCustomPropertiesSidebar = observer(function IssueCustomPropertiesSidebar(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, className } = props;
  // store hooks
  const { getProjectById } = useProject();
  const { isProjectFetched, fetchProjectIssueTypes, getPropertiesByIssueTypeId } = useIssueTypes();
  const {
    issue: { getIssueById },
    propertyValue: { getPropertyValuesByIssueId, isIssueFetched, fetchPropertyValues, updatePropertyValues },
  } = useIssueDetail();
  // derived values
  const project = getProjectById(projectId);
  const isEnabled = !!project?.is_issue_type_enabled;
  const issue = getIssueById(issueId);
  const issueTypeId = issue?.type_id;
  const properties = getPropertiesByIssueTypeId(issueTypeId, true);
  const values = getPropertyValuesByIssueId(issueId) ?? {};

  useEffect(() => {
    if (!isEnabled || !workspaceSlug || !projectId) return;
    if (!isProjectFetched(projectId)) void fetchProjectIssueTypes(workspaceSlug, projectId);
  }, [isEnabled, workspaceSlug, projectId, isProjectFetched, fetchProjectIssueTypes]);

  useEffect(() => {
    if (!isEnabled || !workspaceSlug || !projectId || !issueId) return;
    if (!isIssueFetched(issueId)) void fetchPropertyValues(workspaceSlug, projectId, issueId);
  }, [isEnabled, workspaceSlug, projectId, issueId, isIssueFetched, fetchPropertyValues]);

  if (!isEnabled || !issueTypeId || properties.length === 0) return null;

  const handleChange = async (propertyId: string, nextValue: TIssuePropertyValue[]) => {
    const property = properties.find((p) => p.id === propertyId);
    if (!property) return;
    const errors = validatePropertyValues([property], { [propertyId]: nextValue });
    if (errors[propertyId]) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: errors[propertyId] });
      return;
    }
    try {
      await updatePropertyValues(workspaceSlug, projectId, issueId, { [propertyId]: nextValue });
    } catch (error: unknown) {
      const message =
        (error as { property_values?: Record<string, string> })?.property_values?.[propertyId] ??
        "Failed to update the property. Please try again.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    }
  };

  return (
    <div className={className}>
      {properties.map((property) => (
        <SidebarPropertyListItem
          key={property.id}
          icon={({ className: iconClassName }) => (
            <IssuePropertyTypeIcon propertyType={property.property_type} className={iconClassName} />
          )}
          label={property.display_name}
          appendElement={property.is_required ? <span className="text-danger-primary">*</span> : undefined}
        >
          <PropertyValueInput
            property={property}
            value={values[property.id] ?? []}
            onChange={(nextValue) => void handleChange(property.id, nextValue)}
            projectId={projectId}
            disabled={disabled}
            variant="sidebar"
          />
        </SidebarPropertyListItem>
      ))}
    </div>
  );
});
