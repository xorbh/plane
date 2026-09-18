/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { EIssuePropertyRelationType, EIssuePropertyType } from "@plane/types";
import type {
  TIssueProperty,
  TIssuePropertyDateFormat,
  TIssuePropertyValue,
  TIssuePropertyValueErrors,
  TIssuePropertyValues,
} from "@plane/types";
import { renderFormattedDate } from "@plane/utils";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^(https?:\/\/|mailto:|ftp:\/\/)\S+$/i;

export const ISSUE_PROPERTY_TYPE_LABELS: Record<EIssuePropertyType, string> = {
  [EIssuePropertyType.TEXT]: "Text",
  [EIssuePropertyType.DECIMAL]: "Number",
  [EIssuePropertyType.OPTION]: "Dropdown",
  [EIssuePropertyType.BOOLEAN]: "Boolean",
  [EIssuePropertyType.DATETIME]: "Date",
  [EIssuePropertyType.RELATION]: "Member picker",
  [EIssuePropertyType.URL]: "URL",
  [EIssuePropertyType.EMAIL]: "Email",
};

/** Property types offered in the settings UI, in display order. */
export const ISSUE_PROPERTY_TYPE_OPTIONS: EIssuePropertyType[] = [
  EIssuePropertyType.TEXT,
  EIssuePropertyType.DECIMAL,
  EIssuePropertyType.OPTION,
  EIssuePropertyType.BOOLEAN,
  EIssuePropertyType.DATETIME,
  EIssuePropertyType.RELATION,
  EIssuePropertyType.URL,
  EIssuePropertyType.EMAIL,
];

export const ISSUE_PROPERTY_DATE_FORMATS: TIssuePropertyDateFormat[] = [
  "MMM dd, yyyy",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "yyyy/MM/dd",
];

export const isMultiCapable = (propertyType: EIssuePropertyType) =>
  propertyType === EIssuePropertyType.OPTION || propertyType === EIssuePropertyType.RELATION;

export const isMemberProperty = (property: TIssueProperty) =>
  property.property_type === EIssuePropertyType.RELATION && property.relation_type === EIssuePropertyRelationType.USER;

/** Initial values for a new work item of a type: property defaults and default options. */
export const getDefaultPropertyValues = (properties: TIssueProperty[]): TIssuePropertyValues => {
  const values: TIssuePropertyValues = {};
  properties.forEach((property) => {
    if (!property.is_active) return;
    if (property.property_type === EIssuePropertyType.OPTION) {
      const defaults = (property.options ?? []).filter((option) => option.is_active && option.is_default);
      if (defaults.length > 0) values[property.id] = defaults.map((option) => option.id);
    } else if (property.default_value && property.default_value.length > 0) {
      values[property.id] = [...property.default_value];
    }
  });
  return values;
};

/** Client side validation mirroring the server rules. Returns errors keyed by property id. */
export const validatePropertyValues = (
  properties: TIssueProperty[],
  values: TIssuePropertyValues
): TIssuePropertyValueErrors => {
  const errors: TIssuePropertyValueErrors = {};
  properties.forEach((property) => {
    if (!property.is_active) return;
    const propertyValues = (values[property.id] ?? []).filter((v) => v !== null && v !== undefined && v !== "");
    if (property.is_required && propertyValues.length === 0) {
      errors[property.id] = `${property.display_name} is required`;
      return;
    }
    const first = propertyValues[0];
    if (first === undefined) return;
    const rules = property.validation_rules ?? {};
    switch (property.property_type) {
      case EIssuePropertyType.DECIMAL: {
        const number = Number(first);
        if (Number.isNaN(number)) errors[property.id] = "Enter a valid number";
        else if (rules.min !== undefined && number < rules.min) errors[property.id] = `Must be at least ${rules.min}`;
        else if (rules.max !== undefined && number > rules.max) errors[property.id] = `Must be at most ${rules.max}`;
        break;
      }
      case EIssuePropertyType.EMAIL:
        if (!EMAIL_RE.test(String(first))) errors[property.id] = "Enter a valid email address";
        break;
      case EIssuePropertyType.URL:
        if (!URL_RE.test(String(first))) errors[property.id] = "Enter a valid URL";
        break;
      case EIssuePropertyType.TEXT:
        if (rules.max_length && String(first).length > rules.max_length)
          errors[property.id] = `Must be at most ${rules.max_length} characters`;
        break;
      default:
        break;
    }
  });
  return errors;
};

/** Human readable rendering for read-only contexts (activity, table cells). */
export const formatPropertyValue = (
  property: TIssueProperty,
  values: TIssuePropertyValue[] | undefined,
  resolveUser?: (userId: string) => string | undefined
): string => {
  if (!values || values.length === 0) return "";
  switch (property.property_type) {
    case EIssuePropertyType.OPTION:
      return values
        .map((value) => property.options?.find((option) => option.id === value)?.name ?? String(value))
        .join(", ");
    case EIssuePropertyType.RELATION:
      return values.map((value) => resolveUser?.(String(value)) ?? String(value)).join(", ");
    case EIssuePropertyType.BOOLEAN:
      return values[0] ? "Yes" : "No";
    case EIssuePropertyType.DATETIME:
      return values.map((value) => renderFormattedDate(String(value)) ?? String(value)).join(", ");
    default:
      return values.map(String).join(", ");
  }
};

/** Diff two value maps and return only the properties that changed. */
export const getChangedPropertyValues = (
  previous: TIssuePropertyValues | undefined,
  next: TIssuePropertyValues
): TIssuePropertyValues => {
  const changed: TIssuePropertyValues = {};
  const keys = new Set([...Object.keys(previous ?? {}), ...Object.keys(next)]);
  keys.forEach((key) => {
    const before = JSON.stringify(previous?.[key] ?? []);
    const after = JSON.stringify(next[key] ?? []);
    if (before !== after) changed[key] = next[key] ?? [];
  });
  return changed;
};
