/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { ISearchIssueResponse, TIssue, TIssuePropertyValueErrors, TIssuePropertyValues } from "@plane/types";
// components
import {
  getChangedPropertyValues,
  getDefaultPropertyValues,
  validatePropertyValues,
} from "@/components/issue-types/helpers";
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type {
  TActiveAdditionalPropertiesProps,
  TCreateUpdatePropertyValuesProps,
  TPropertyValuesValidationProps,
} from "@/components/issues/issue-modal/context";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>({});
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { getProjectById } = useProject();
  const { getProjectDefaultIssueTypeId, getPropertiesByIssueTypeId } = useIssueTypes();
  const {
    propertyValue: { getPropertyValuesByIssueId, updatePropertyValues },
  } = useIssueDetail();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  const isTypesEnabled = useCallback(
    (projectId: string | null | undefined) => !!projectId && !!getProjectById(projectId)?.is_issue_type_enabled,
    [getProjectById]
  );

  const getIssueTypeIdOnProjectChange = useCallback(
    (projectId: string) => {
      if (!isTypesEnabled(projectId)) return null;
      const defaultTypeId = getProjectDefaultIssueTypeId(projectId);
      // seed defaults for the new type
      const properties = getPropertiesByIssueTypeId(defaultTypeId, true);
      setIssuePropertyValues(getDefaultPropertyValues(properties));
      setIssuePropertyValueErrors({});
      return defaultTypeId;
    },
    [isTypesEnabled, getProjectDefaultIssueTypeId, getPropertiesByIssueTypeId]
  );

  const getActiveAdditionalPropertiesLength = useCallback(
    ({ projectId, watch }: TActiveAdditionalPropertiesProps) => {
      if (!isTypesEnabled(projectId)) return 0;
      return getPropertiesByIssueTypeId(watch("type_id"), true).length;
    },
    [isTypesEnabled, getPropertiesByIssueTypeId]
  );

  const handlePropertyValuesValidation = useCallback(
    ({ projectId, watch }: TPropertyValuesValidationProps) => {
      if (!isTypesEnabled(projectId)) return true;
      const properties = getPropertiesByIssueTypeId(watch("type_id"), true);
      const errors = validatePropertyValues(properties, issuePropertyValues);
      setIssuePropertyValueErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [isTypesEnabled, getPropertiesByIssueTypeId, issuePropertyValues]
  );

  const handleCreateUpdatePropertyValues = useCallback(
    async ({ issueId, projectId, workspaceSlug, issueTypeId, isDraft }: TCreateUpdatePropertyValuesProps) => {
      if (isDraft || !isTypesEnabled(projectId) || !issueTypeId) return;
      const properties = getPropertiesByIssueTypeId(issueTypeId, true);
      if (properties.length === 0) return;
      // only send the properties of the selected type
      const payload: TIssuePropertyValues = {};
      properties.forEach((property) => {
        payload[property.id] = issuePropertyValues[property.id] ?? [];
      });
      const changed = getChangedPropertyValues(getPropertyValuesByIssueId(issueId), payload);
      const hasAnyValue = Object.values(payload).some((values) => values.length > 0);
      if (Object.keys(changed).length === 0 || (!hasAnyValue && !getPropertyValuesByIssueId(issueId))) return;
      try {
        await updatePropertyValues(workspaceSlug, projectId, issueId, changed);
      } catch (error: unknown) {
        const message = Object.values(
          (error as { property_values?: Record<string, string> })?.property_values ?? {}
        )[0];
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: message ?? "Work item saved, but its custom properties could not be updated.",
        });
      }
    },
    [isTypesEnabled, getPropertiesByIssueTypeId, issuePropertyValues, getPropertyValuesByIssueId, updatePropertyValues]
  );

  return (
    <IssueModalContext.Provider
      // oxlint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId: null,
        setWorkItemTemplateId: () => {},
        isApplyingTemplate: false,
        setIsApplyingTemplate: () => {},
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues,
        setIssuePropertyValues,
        issuePropertyValueErrors,
        setIssuePropertyValueErrors,
        getIssueTypeIdOnProjectChange,
        getActiveAdditionalPropertiesLength,
        handlePropertyValuesValidation,
        handleCreateUpdatePropertyValues,
        handleProjectEntitiesFetch: () => Promise.resolve(),
        handleTemplateChange: () => Promise.resolve(),
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem: () => Promise.resolve(),
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
