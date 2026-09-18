/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ChevronDown } from "lucide-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  projectId: string | null | undefined;
  value: string | null | undefined;
  onChange: (issueTypeId: string) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  /** Render even when the project has a single type. */
  renderWhenSingle?: boolean;
  tabIndex?: number;
};

export function IssueTypeLabel({
  issueTypeId,
  className,
}: {
  issueTypeId: string | null | undefined;
  className?: string;
}) {
  const { getIssueTypeById } = useIssueTypes();
  const issueType = getIssueTypeById(issueTypeId);
  if (!issueType) return null;
  return (
    <span className={cn("flex items-center gap-1.5 truncate", className)}>
      <Logo logo={issueType.logo_props} size={14} />
      <span className="truncate">{issueType.name}</span>
    </span>
  );
}

/** Dropdown to pick a work item type among the project's active types. */
export const IssueTypeSelect = observer(function IssueTypeSelect(props: Props) {
  const {
    projectId,
    value,
    onChange,
    disabled = false,
    className,
    buttonClassName,
    renderWhenSingle = false,
    tabIndex,
  } = props;
  // store hooks
  const { getProjectIssueTypes, getIssueTypeById } = useIssueTypes();
  // derived values
  const issueTypes = getProjectIssueTypes(projectId, true);
  const selected = getIssueTypeById(value);

  if (issueTypes.length === 0 || (issueTypes.length < 2 && !renderWhenSingle)) return null;

  return (
    <CustomSelect
      value={value ?? null}
      onChange={(issueTypeId: string) => onChange(issueTypeId)}
      disabled={disabled}
      className={className}
      tabIndex={tabIndex}
      customButtonClassName="w-full"
      customButton={
        <span
          className={cn(
            "flex h-7 max-w-full items-center gap-1.5 rounded-md border-[0.5px] border-strong px-2 text-body-xs-regular",
            disabled ? "cursor-not-allowed opacity-60" : "hover:bg-layer-transparent-hover",
            buttonClassName
          )}
        >
          {selected ? (
            <>
              <Logo logo={selected.logo_props} size={14} />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-placeholder">Select type</span>
          )}
          <ChevronDown className="size-3 shrink-0 text-tertiary" />
        </span>
      }
      maxHeight="md"
    >
      {issueTypes.map((issueType) => (
        <CustomSelect.Option key={issueType.id} value={issueType.id}>
          <span className="flex items-center gap-1.5">
            <Logo logo={issueType.logo_props} size={14} />
            <span className="truncate">{issueType.name}</span>
            {issueType.is_default && <span className="text-caption-sm-regular text-tertiary">Default</span>}
          </span>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
});
