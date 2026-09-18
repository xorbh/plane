/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Calendar, Hash, Link2, ListChecks, Mail, ToggleLeft, Type, Users } from "lucide-react";
// plane imports
import { EIssuePropertyType } from "@plane/types";
import { cn } from "@plane/utils";

type Props = {
  propertyType: EIssuePropertyType;
  className?: string;
};

/** Icon for a custom property type, sized by the caller via className. */
export function IssuePropertyTypeIcon({ propertyType, className }: Props) {
  const classes = cn("size-4 shrink-0", className);
  switch (propertyType) {
    case EIssuePropertyType.DECIMAL:
      return <Hash className={classes} />;
    case EIssuePropertyType.OPTION:
      return <ListChecks className={classes} />;
    case EIssuePropertyType.BOOLEAN:
      return <ToggleLeft className={classes} />;
    case EIssuePropertyType.DATETIME:
      return <Calendar className={classes} />;
    case EIssuePropertyType.RELATION:
      return <Users className={classes} />;
    case EIssuePropertyType.URL:
      return <Link2 className={classes} />;
    case EIssuePropertyType.EMAIL:
      return <Mail className={classes} />;
    case EIssuePropertyType.TEXT:
    default:
      return <Type className={classes} />;
  }
}
