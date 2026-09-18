/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EIssuePropertyType } from "@plane/types";
// components
import { IssuePropertyTypeIcon } from "@/components/issue-types/property-icon";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { IssueActivityBlockComponent, IssueLink } from "./";

type TIssuePropertyActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

/**
 * Renders a custom property value change. The backend stores the property id in
 * `new_identifier`, human readable values in `old_value`/`new_value`, and a
 * fallback sentence in `comment` for properties that no longer exist.
 */
export const IssuePropertyActivity = observer(function IssuePropertyActivity(props: TIssuePropertyActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const { getPropertyById } = useIssueTypes();
  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  const property = getPropertyById(activity.new_identifier ?? activity.old_identifier);
  const propertyName = property?.display_name ?? activity.comment?.replace(/^(set|updated|removed)\s/, "") ?? "";
  const oldValue = activity.old_value;
  const newValue = activity.new_value;

  return (
    <IssueActivityBlockComponent
      icon={
        <IssuePropertyTypeIcon
          propertyType={property?.property_type ?? EIssuePropertyType.TEXT}
          className="h-3.5 w-3.5 text-secondary"
        />
      }
      activityId={activityId}
      ends={ends}
    >
      <>
        {!newValue ? (
          <>
            removed <span className="font-medium text-primary">{propertyName}</span>
            {oldValue && (
              <>
                {" "}
                (was <span className="font-medium text-primary">{oldValue}</span>)
              </>
            )}
          </>
        ) : (
          <>
            {oldValue ? "changed" : "set"} <span className="font-medium text-primary">{propertyName}</span>
            {oldValue && (
              <>
                {" "}
                from <span className="font-medium text-primary">{oldValue}</span>
              </>
            )}{" "}
            to <span className="font-medium text-primary">{newValue}</span>
          </>
        )}
        {showIssue ? ` for ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
