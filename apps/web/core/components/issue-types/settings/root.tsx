/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { AlertModalCore, Loader } from "@plane/ui";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { IssueTypeSettingsItem } from "./type-item";
import { IssueTypeModal } from "./type-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const ProjectIssueTypesSettings = observer(function ProjectIssueTypesSettings(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  // store hooks
  const { getProjectById, updateProject } = useProject();
  const { isProjectFetched, loaderMap, fetchProjectIssueTypes, getProjectIssueTypes } = useIssueTypes();
  // states
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // derived values
  const project = getProjectById(projectId);
  const isEnabled = !!project?.is_issue_type_enabled;
  const issueTypes = getProjectIssueTypes(projectId);
  const isLoading = !isProjectFetched(projectId) && !!loaderMap[projectId];

  useEffect(() => {
    if (!isEnabled) return;
    void fetchProjectIssueTypes(workspaceSlug, projectId, true);
  }, [isEnabled, workspaceSlug, projectId, fetchProjectIssueTypes]);

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      await updateProject(workspaceSlug, projectId, { is_issue_type_enabled: true });
      await fetchProjectIssueTypes(workspaceSlug, projectId, true);
      setIsEnableModalOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Work item types enabled for this project." });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Failed to enable work item types. Please try again.",
      });
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <section className="w-full">
      <AlertModalCore
        isOpen={isEnableModalOpen}
        handleClose={() => setIsEnableModalOpen(false)}
        handleSubmit={() => void handleEnable()}
        isSubmitting={isEnabling}
        title="Once enabled, work item types can't be disabled."
        content="A default Task type will be created and assigned to every existing work item in this project. You can then add more types and custom properties."
        primaryButtonText={{ loading: "Setting up", default: "Enable" }}
        variant="primary"
      />
      <IssueTypeModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
      <SettingsHeading
        title="Work item types"
        description="Define types like Bug, Story or Request, each with its own custom properties."
        control={
          isEnabled && isAdmin ? (
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              onClick={() => setIsCreateOpen(true)}
            >
              Add work item type
            </Button>
          ) : undefined
        }
      />
      <div className="mt-7">
        {!isEnabled ? (
          <SettingsBoxedControlItem
            title="Enable work item types"
            description="Adds a default Task type to this project. Once enabled, work item types cannot be turned off."
            control={
              <Button variant="primary" size="sm" onClick={() => setIsEnableModalOpen(true)} disabled={!isAdmin}>
                Enable
              </Button>
            }
          />
        ) : isLoading && issueTypes.length === 0 ? (
          <Loader className="space-y-3">
            <Loader.Item height="64px" />
            <Loader.Item height="64px" />
          </Loader>
        ) : (
          <div className="flex flex-col gap-3">
            {issueTypes.map((issueType, index) => (
              <IssueTypeSettingsItem
                key={issueType.id}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueType={issueType}
                isAdmin={isAdmin}
                defaultOpen={index === 0}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
