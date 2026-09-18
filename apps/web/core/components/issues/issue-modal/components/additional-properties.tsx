/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import { cn } from "@plane/utils";
// components
import { getDefaultPropertyValues } from "@/components/issue-types/helpers";
import { IssuePropertyTypeIcon } from "@/components/issue-types/property-icon";
import { PropertyValueInput } from "@/components/issue-types/values/property-value-input";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  projectId: string | null;
  workspaceSlug: string;
  issueTypeId: string | null | undefined;
  issueId?: string;
  disabled?: boolean;
};

/**
 * Custom properties of the selected work item type, shown in the create/update
 * modal above the default property chips. Values live in the modal context and
 * are persisted after the work item itself is saved.
 */
export const IssueAdditionalProperties = observer(function IssueAdditionalProperties(props: Props) {
  const { projectId, workspaceSlug, issueTypeId, issueId, disabled = false } = props;
  // store hooks
  const { getProjectById } = useProject();
  const { isProjectFetched, fetchProjectIssueTypes, getPropertiesByIssueTypeId } = useIssueTypes();
  const {
    propertyValue: { fetchPropertyValues, getPropertyValuesByIssueId },
  } = useIssueDetail();
  const { issuePropertyValues, setIssuePropertyValues, issuePropertyValueErrors, setIssuePropertyValueErrors } =
    useIssueModal();
  // refs: which (issue, type) pair the current values were seeded for
  const seededFor = useRef<string | null>(null);
  // derived values
  const project = getProjectById(projectId);
  const isEnabled = !!project?.is_issue_type_enabled;
  const properties = isEnabled ? getPropertiesByIssueTypeId(issueTypeId, true) : [];

  // make sure the project's types are loaded
  useEffect(() => {
    if (!isEnabled || !workspaceSlug || !projectId) return;
    if (!isProjectFetched(projectId)) void fetchProjectIssueTypes(workspaceSlug, projectId);
  }, [isEnabled, workspaceSlug, projectId, isProjectFetched, fetchProjectIssueTypes]);

  // seed values: existing work item -> stored values, new work item -> type defaults
  useEffect(() => {
    if (!isEnabled || !workspaceSlug || !projectId || !issueTypeId) return;
    const key = `${issueId ?? "new"}:${issueTypeId}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    setIssuePropertyValueErrors({});
    if (issueId) {
      const cached = getPropertyValuesByIssueId(issueId);
      if (cached) {
        setIssuePropertyValues({ ...cached });
        return;
      }
      void fetchPropertyValues(workspaceSlug, projectId, issueId)
        .then((values) => setIssuePropertyValues({ ...values }))
        .catch(() => setIssuePropertyValues({}));
    } else {
      setIssuePropertyValues(getDefaultPropertyValues(getPropertiesByIssueTypeId(issueTypeId, true)));
    }
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps
  }, [isEnabled, workspaceSlug, projectId, issueTypeId, issueId, properties.length]);

  if (!projectId || !workspaceSlug || properties.length === 0) return null;

  return (
    <div className="mb-3 grid grid-cols-1 gap-x-4 gap-y-2 border-b-[0.5px] border-subtle pb-3 sm:grid-cols-2">
      {properties.map((property) => {
        const error = issuePropertyValueErrors[property.id];
        return (
          <div key={property.id} className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5 text-caption-sm-regular text-tertiary">
              <IssuePropertyTypeIcon propertyType={property.property_type} className="size-3.5" />
              <span className="truncate">{property.display_name}</span>
              {property.is_required && <span className="text-danger-primary">*</span>}
            </div>
            <PropertyValueInput
              property={property}
              value={issuePropertyValues[property.id] ?? []}
              onChange={(nextValue) => {
                setIssuePropertyValues((prev) => ({ ...prev, [property.id]: nextValue }));
                if (error)
                  setIssuePropertyValueErrors((prev) => {
                    const next = { ...prev };
                    delete next[property.id];
                    return next;
                  });
              }}
              projectId={projectId}
              disabled={disabled}
              variant="modal"
              hasError={!!error}
            />
            {error && <span className={cn("text-caption-sm-regular text-danger-primary")}>{error}</span>}
          </div>
        );
      })}
    </div>
  );
});
