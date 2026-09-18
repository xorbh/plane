/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
// components
import { IssueTypeSelect } from "@/components/issue-types/type-select";
import { IssueIdentifier } from "@/components/issues/issue-detail/issue-identifier";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
import { useParams } from "react-router";

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

/**
 * Identifier plus, when the project has more than one active work item type, a
 * dropdown to switch the type. Values of properties that only exist on the old
 * type stay in the database but are hidden until the type is switched back.
 */
export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId, disabled } = props;
  // router
  const { workspaceSlug } = useParams();
  // store hooks
  const {
    issue: { getIssueById },
    updateIssue,
    propertyValue: { fetchPropertyValues },
  } = useIssueDetail();
  const { getProjectById } = useProject();
  const { isProjectFetched, fetchProjectIssueTypes } = useIssueTypes();
  // derived values
  const issue = getIssueById(issueId);
  const projectId = issue?.project_id;
  const isEnabled = !!projectId && !!getProjectById(projectId)?.is_issue_type_enabled;

  useEffect(() => {
    if (!isEnabled || !workspaceSlug || !projectId) return;
    if (!isProjectFetched(projectId)) void fetchProjectIssueTypes(workspaceSlug.toString(), projectId);
  }, [isEnabled, workspaceSlug, projectId, isProjectFetched, fetchProjectIssueTypes]);

  if (!issue || !projectId) return <></>;

  const handleChange = async (issueTypeId: string) => {
    if (!workspaceSlug || issueTypeId === issue.type_id) return;
    try {
      await updateIssue(workspaceSlug.toString(), projectId, issueId, { type_id: issueTypeId });
      await fetchPropertyValues(workspaceSlug.toString(), projectId, issueId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to change the work item type." });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <IssueIdentifier issueId={issueId} projectId={projectId} size="md" enableClickToCopyIdentifier />
      {isEnabled && (
        <IssueTypeSelect
          projectId={projectId}
          value={issue.type_id}
          onChange={(issueTypeId) => void handleChange(issueTypeId)}
          disabled={disabled}
          renderWhenSingle
          buttonClassName="h-6 border-none bg-layer-transparent px-1.5"
        />
      )}
    </div>
  );
});
