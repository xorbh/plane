/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePropertyValue } from "./issue-types";

/** Custom property values of one work item keyed by property id. */
export type TIssuePropertyValues = Record<string, TIssuePropertyValue[]>;

/** Validation errors keyed by property id. */
export type TIssuePropertyValueErrors = Record<string, string>;
