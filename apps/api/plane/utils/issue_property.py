# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Helpers for encoding, decoding and validating custom property values.

Wire format (what the API accepts and returns), per property type:

- TEXT / URL / EMAIL : string
- DECIMAL            : number (int or float); returned as a float
- DATETIME           : ISO 8601 string (``YYYY-MM-DD`` or full datetime)
- BOOLEAN            : boolean
- OPTION             : option id (uuid string)
- RELATION           : related object id (uuid string)

The API always exchanges a *list* of wire values per property. Single valued
properties carry at most one element; an empty list clears the property.
"""

from __future__ import annotations

# Python imports
import re
import uuid
from datetime import date, datetime, time, timezone as dt_timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

# Django imports
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

# Module imports
from plane.db.models import (
    Issue,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyTypeChoices,
    IssuePropertyValue,
    User,
)


class PropertyValueError(ValueError):
    """Raised when a wire value cannot be stored for a property."""


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_URL_RE = re.compile(r"^(https?://|mailto:|ftp://)[^\s]+$", re.IGNORECASE)


def _is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def normalize_wire_values(raw: Any) -> list:
    """Coerce a request payload value to a list of wire values, dropping empties."""
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        values = list(raw)
    else:
        values = [raw]
    return [v for v in values if v is not None and v != ""]


def value_column_for(property_type: str) -> str:
    return {
        IssuePropertyTypeChoices.TEXT: "value_text",
        IssuePropertyTypeChoices.URL: "value_text",
        IssuePropertyTypeChoices.EMAIL: "value_text",
        IssuePropertyTypeChoices.DECIMAL: "value_decimal",
        IssuePropertyTypeChoices.DATETIME: "value_datetime",
        IssuePropertyTypeChoices.BOOLEAN: "value_boolean",
        IssuePropertyTypeChoices.OPTION: "value_option_id",
        IssuePropertyTypeChoices.RELATION: "value_uuid",
    }[property_type]


def decode_wire_value(prop: IssueProperty, value: Any, *, option_ids: set | None = None) -> Any:
    """
    Validate a single wire value against ``prop`` and return the python value to
    store in the property's value column. Raises ``PropertyValueError``.
    """
    ptype = prop.property_type
    rules = prop.validation_rules or {}

    if ptype in (IssuePropertyTypeChoices.TEXT, IssuePropertyTypeChoices.URL, IssuePropertyTypeChoices.EMAIL):
        if not isinstance(value, str):
            raise PropertyValueError("Value must be a string")
        text = value.strip()
        if not text:
            raise PropertyValueError("Value must not be empty")
        max_length = rules.get("max_length")
        if max_length and len(text) > int(max_length):
            raise PropertyValueError(f"Value must be at most {max_length} characters")
        if ptype == IssuePropertyTypeChoices.EMAIL and not _EMAIL_RE.match(text):
            raise PropertyValueError("Value must be a valid email address")
        if ptype == IssuePropertyTypeChoices.URL and not _URL_RE.match(text):
            raise PropertyValueError("Value must be a valid URL")
        return text

    if ptype == IssuePropertyTypeChoices.DECIMAL:
        if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
            raise PropertyValueError("Value must be a number")
        try:
            number = Decimal(str(value))
        except (InvalidOperation, ValueError):
            raise PropertyValueError("Value must be a number")
        if not number.is_finite():
            raise PropertyValueError("Value must be a finite number")
        minimum = rules.get("min")
        maximum = rules.get("max")
        if minimum is not None and number < Decimal(str(minimum)):
            raise PropertyValueError(f"Value must be at least {minimum}")
        if maximum is not None and number > Decimal(str(maximum)):
            raise PropertyValueError(f"Value must be at most {maximum}")
        return number

    if ptype == IssuePropertyTypeChoices.DATETIME:
        if isinstance(value, datetime):
            parsed = value
        elif isinstance(value, date):
            parsed = datetime.combine(value, time.min)
        elif isinstance(value, str):
            parsed = parse_datetime(value)
            if parsed is None:
                as_date = parse_date(value)
                if as_date is None:
                    raise PropertyValueError("Value must be an ISO 8601 date")
                parsed = datetime.combine(as_date, time.min)
        else:
            raise PropertyValueError("Value must be an ISO 8601 date")
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, dt_timezone.utc)
        return parsed

    if ptype == IssuePropertyTypeChoices.BOOLEAN:
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in ("true", "false"):
            return value.lower() == "true"
        raise PropertyValueError("Value must be a boolean")

    if ptype == IssuePropertyTypeChoices.OPTION:
        if not _is_uuid(value):
            raise PropertyValueError("Value must be an option id")
        option_id = uuid.UUID(str(value))
        if option_ids is None:
            option_ids = set(
                IssuePropertyOption.objects.filter(property=prop, is_active=True).values_list("id", flat=True)
            )
        if option_id not in option_ids:
            raise PropertyValueError("Value is not an option of this property")
        return option_id

    if ptype == IssuePropertyTypeChoices.RELATION:
        if not _is_uuid(value):
            raise PropertyValueError("Value must be an id")
        related_id = uuid.UUID(str(value))
        if prop.relation_type == "USER":
            exists = User.objects.filter(
                id=related_id,
                member_project__project_id=prop.project_id,
                member_project__is_active=True,
            ).exists()
            if not exists:
                raise PropertyValueError("Value must be a member of this project")
        else:
            exists = Issue.objects.filter(id=related_id, workspace_id=prop.workspace_id).exists()
            if not exists:
                raise PropertyValueError("Value must be a work item in this workspace")
        return related_id

    raise PropertyValueError("Unsupported property type")


def encode_stored_value(prop: IssueProperty, row: IssuePropertyValue) -> Any:
    """Return the wire representation of a stored value row."""
    ptype = prop.property_type
    if ptype in (IssuePropertyTypeChoices.TEXT, IssuePropertyTypeChoices.URL, IssuePropertyTypeChoices.EMAIL):
        return row.value_text
    if ptype == IssuePropertyTypeChoices.DECIMAL:
        return float(row.value_decimal) if row.value_decimal is not None else None
    if ptype == IssuePropertyTypeChoices.DATETIME:
        return row.value_datetime.isoformat() if row.value_datetime else None
    if ptype == IssuePropertyTypeChoices.BOOLEAN:
        return row.value_boolean
    if ptype == IssuePropertyTypeChoices.OPTION:
        return str(row.value_option_id) if row.value_option_id else None
    if ptype == IssuePropertyTypeChoices.RELATION:
        return str(row.value_uuid) if row.value_uuid else None
    return None


def stored_values_by_property(rows: Iterable[IssuePropertyValue], properties_by_id: dict) -> dict:
    """Group value rows into ``{property_id: [wire values]}``."""
    result: dict = {}
    for row in rows:
        prop = properties_by_id.get(row.property_id)
        if prop is None:
            continue
        encoded = encode_stored_value(prop, row)
        if encoded is None:
            continue
        result.setdefault(str(row.property_id), []).append(encoded)
    return result


def build_value_row(prop: IssueProperty, issue_id, python_value: Any, **extra) -> IssuePropertyValue:
    """Create an unsaved ``IssuePropertyValue`` for ``python_value``."""
    column = value_column_for(prop.property_type)
    return IssuePropertyValue(
        issue_id=issue_id,
        property_id=prop.id,
        project_id=prop.project_id,
        workspace_id=prop.workspace_id,
        **{column: python_value},
        **extra,
    )


def display_value(prop: IssueProperty, wire_value: Any) -> str:
    """Human readable rendering of a wire value, used for activity logs."""
    if wire_value is None:
        return ""
    ptype = prop.property_type
    if ptype == IssuePropertyTypeChoices.OPTION:
        option = IssuePropertyOption.all_objects.filter(id=wire_value).first()
        return option.name if option else str(wire_value)
    if ptype == IssuePropertyTypeChoices.RELATION:
        if prop.relation_type == "USER":
            user = User.objects.filter(id=wire_value).first()
            return user.display_name if user else str(wire_value)
        issue = Issue.all_objects.filter(id=wire_value).select_related("project").first()
        return f"{issue.project.identifier}-{issue.sequence_id}" if issue else str(wire_value)
    if ptype == IssuePropertyTypeChoices.DATETIME:
        return str(wire_value)[:10]
    if ptype == IssuePropertyTypeChoices.BOOLEAN:
        return "Yes" if wire_value else "No"
    if ptype == IssuePropertyTypeChoices.DECIMAL:
        number = float(wire_value)
        return str(int(number)) if number.is_integer() else str(number)
    return str(wire_value)
