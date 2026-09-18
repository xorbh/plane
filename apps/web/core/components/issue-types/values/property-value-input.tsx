/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Switch } from "@plane/propel/switch";
// plane imports
import { EIssuePropertyType } from "@plane/types";
import type { TIssueProperty, TIssuePropertyValue } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { PropertyOptionDropdown } from "@/components/dropdowns/property-option";
// local imports
import { isMemberProperty } from "../helpers";

export type TPropertyValueInputVariant = "sidebar" | "modal";

type Props = {
  property: TIssueProperty;
  value: TIssuePropertyValue[];
  onChange: (value: TIssuePropertyValue[]) => void;
  projectId: string;
  disabled?: boolean;
  variant?: TPropertyValueInputVariant;
  hasError?: boolean;
  tabIndex?: number;
};

const SIDEBAR_TEXT_CLASS =
  "w-full rounded-sm border-none bg-transparent px-2 py-1 text-body-xs-regular placeholder:text-placeholder hover:bg-layer-transparent-hover focus:bg-layer-transparent-hover";
const MODAL_TEXT_CLASS =
  "h-7 w-full rounded-md border-[0.5px] border-strong bg-transparent px-2 py-1 text-body-xs-regular placeholder:text-placeholder";

/**
 * Editor for one custom property value. Text-like inputs commit on blur or Enter
 * so a keystroke never triggers a network request.
 */
export const PropertyValueInput = observer(function PropertyValueInput(props: Props) {
  const {
    property,
    value,
    onChange,
    projectId,
    disabled = false,
    variant = "sidebar",
    hasError = false,
    tabIndex,
  } = props;
  const first = value?.[0];
  const isSidebar = variant === "sidebar";
  const textClass = cn(isSidebar ? SIDEBAR_TEXT_CLASS : MODAL_TEXT_CLASS, hasError && "border-danger-strong", {
    "cursor-not-allowed opacity-60": disabled,
  });
  // local draft for text-like inputs
  const [draft, setDraft] = useState<string>(first !== undefined ? String(first) : "");
  useEffect(() => {
    setDraft(first !== undefined ? String(first) : "");
  }, [first]);

  const commitText = () => {
    const trimmed = draft.trim();
    const current = first !== undefined ? String(first) : "";
    if (trimmed === current) return;
    onChange(trimmed ? [trimmed] : []);
  };

  const commitNumber = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (first !== undefined) onChange([]);
      return;
    }
    const number = Number(trimmed);
    if (Number.isNaN(number)) {
      setDraft(first !== undefined ? String(first) : "");
      return;
    }
    if (first !== undefined && Number(first) === number) return;
    onChange([number]);
  };

  switch (property.property_type) {
    case EIssuePropertyType.TEXT: {
      const format = property.settings?.display_format ?? "single-line";
      if (format === "read-only" && !disabled) {
        return <div className="px-2 py-1 text-body-xs-regular text-secondary">{draft || "—"}</div>;
      }
      if (format === "multi-line") {
        return (
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitText}
            placeholder={property.description || `Add ${property.display_name.toLowerCase()}`}
            disabled={disabled}
            hasError={hasError}
            className={cn(textClass, "min-h-[3.5rem] resize-y")}
            tabIndex={tabIndex}
          />
        );
      }
      return (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder={`Add ${property.display_name.toLowerCase()}`}
          disabled={disabled}
          hasError={hasError}
          className={textClass}
          tabIndex={tabIndex}
        />
      );
    }
    case EIssuePropertyType.URL:
    case EIssuePropertyType.EMAIL:
      return (
        <Input
          type={property.property_type === EIssuePropertyType.EMAIL ? "email" : "url"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder={property.property_type === EIssuePropertyType.EMAIL ? "name@example.com" : "https://"}
          disabled={disabled}
          hasError={hasError}
          className={textClass}
          tabIndex={tabIndex}
        />
      );
    case EIssuePropertyType.DECIMAL:
      return (
        <Input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitNumber}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          min={property.validation_rules?.min}
          max={property.validation_rules?.max}
          step="any"
          placeholder="Add number"
          disabled={disabled}
          hasError={hasError}
          className={textClass}
          tabIndex={tabIndex}
        />
      );
    case EIssuePropertyType.BOOLEAN:
      return (
        <div className={cn("flex h-7 items-center gap-2", isSidebar && "px-2")}>
          <Switch
            size="sm"
            value={first === true}
            onChange={(checked: boolean) => onChange([checked])}
            disabled={disabled}
            aria-label={property.display_name}
          />
          <span className="text-body-xs-regular text-secondary">{first === true ? "Yes" : "No"}</span>
        </div>
      );
    case EIssuePropertyType.DATETIME:
      return (
        <DateDropdown
          value={first !== undefined ? String(first) : null}
          onChange={(date) => onChange(date ? [renderFormattedPayloadDate(date) ?? ""] : [])}
          placeholder={`Add ${property.display_name.toLowerCase()}`}
          disabled={disabled}
          buttonVariant={isSidebar ? "transparent-with-text" : "border-with-text"}
          className={cn("group", isSidebar && "w-full grow")}
          buttonContainerClassName={isSidebar ? "w-full text-left h-7.5" : undefined}
          buttonClassName={cn(
            "text-body-xs-regular",
            first === undefined && "text-placeholder",
            hasError && "border-danger-strong"
          )}
          hideIcon={isSidebar}
          clearIconClassName="h-3 w-3 hidden group-hover:inline"
          tabIndex={tabIndex}
        />
      );
    case EIssuePropertyType.RELATION: {
      if (!isMemberProperty(property)) {
        // Work item relations are stored by the API but have no picker yet.
        return (
          <div className="px-2 py-1 text-body-xs-regular text-secondary">{value.length ? value.join(", ") : "—"}</div>
        );
      }
      const common = {
        projectId,
        disabled,
        placeholder: `Add ${property.display_name.toLowerCase()}`,
        buttonVariant: (isSidebar ? "transparent-with-text" : "border-with-text") as
          | "transparent-with-text"
          | "border-with-text",
        className: cn("group", isSidebar && "w-full grow"),
        buttonContainerClassName: isSidebar ? "w-full text-left h-7.5" : undefined,
        buttonClassName: cn(
          "text-body-xs-regular",
          value.length === 0 && "text-placeholder",
          hasError && "border-danger-strong"
        ),
        hideIcon: value.length === 0,
        dropdownArrow: isSidebar,
        dropdownArrowClassName: "h-3.5 w-3.5 hidden group-hover:inline",
        tabIndex,
      };
      if (property.is_multi) {
        return (
          <MemberDropdown {...common} multiple value={value.map(String)} onChange={(ids: string[]) => onChange(ids)} />
        );
      }
      return (
        <MemberDropdown
          {...common}
          multiple={false}
          value={first !== undefined ? String(first) : null}
          onChange={(id: string | null) => onChange(id ? [id] : [])}
        />
      );
    }
    case EIssuePropertyType.OPTION:
      return (
        <PropertyOptionDropdown
          property={property}
          value={value.map(String)}
          onChange={(ids) => onChange(ids)}
          disabled={disabled}
          placeholder={property.is_multi ? "Select options" : "Select option"}
          buttonVariant={isSidebar ? "transparent-with-text" : "border-with-text"}
          className={cn("group", isSidebar && "w-full grow")}
          buttonContainerClassName={isSidebar ? "w-full text-left h-7.5" : undefined}
          buttonClassName={cn("text-body-xs-regular", hasError && "border-danger-strong")}
          hideIcon={isSidebar}
          dropdownArrow={isSidebar}
          dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
          tabIndex={tabIndex}
        />
      );
    default:
      return null;
  }
});
