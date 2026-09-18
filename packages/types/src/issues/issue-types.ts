/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export enum EIssuePropertyType {
  TEXT = "TEXT",
  DATETIME = "DATETIME",
  DECIMAL = "DECIMAL",
  BOOLEAN = "BOOLEAN",
  OPTION = "OPTION",
  RELATION = "RELATION",
  URL = "URL",
  EMAIL = "EMAIL",
}

export enum EIssuePropertyRelationType {
  ISSUE = "ISSUE",
  USER = "USER",
}

export type TIssuePropertyTextFormat = "single-line" | "multi-line" | "read-only";
export type TIssuePropertyDateFormat = "MMM dd, yyyy" | "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy/MM/dd";

export type TIssuePropertySettings = {
  display_format?: TIssuePropertyTextFormat | TIssuePropertyDateFormat;
};

export type TIssuePropertyValidationRules = {
  min?: number;
  max?: number;
  max_length?: number;
};

export type TIssueType = {
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps;
  is_epic: boolean;
  is_default: boolean;
  is_active: boolean;
  level: number;
  workspace: string;
  project_ids: string[];
  issue_exists?: boolean;
  external_source?: string | null;
  external_id?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type TIssuePropertyOption = {
  id: string;
  property: string;
  name: string;
  description: string;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  logo_props: TLogoProps | Record<string, never>;
  external_source?: string | null;
  external_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TIssueProperty = {
  id: string;
  issue_type: string;
  display_name: string;
  description: string;
  property_type: EIssuePropertyType;
  relation_type: EIssuePropertyRelationType | null;
  is_required: boolean;
  is_active: boolean;
  is_multi: boolean;
  default_value: TIssuePropertyValue[];
  settings: TIssuePropertySettings;
  validation_rules: TIssuePropertyValidationRules;
  logo_props: TLogoProps | Record<string, never>;
  sort_order: number;
  options: TIssuePropertyOption[];
  project: string;
  workspace: string;
  external_source?: string | null;
  external_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

/** Payload accepted when creating a property; options may be created inline for dropdowns. */
export type TIssuePropertyPayload = Partial<
  Omit<TIssueProperty, "options" | "id" | "issue_type" | "project" | "workspace">
> & {
  options?: Partial<TIssuePropertyOption>[];
};

/** A single wire value: text, number, boolean, ISO date, option id or related object id. */
export type TIssuePropertyValue = string | number | boolean;

/** Values of one work item keyed by property id. Always a list; empty list means unset. */
export type TIssuePropertyValuesByIssue = Record<string, Record<string, TIssuePropertyValue[]>>;
