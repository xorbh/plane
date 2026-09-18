# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import uuid

# Django imports
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, ProjectEntityPermission, allow_permission
from plane.app.views.base import BaseAPIView
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import Issue, IssueProperty, IssuePropertyOption, IssuePropertyTypeChoices, IssuePropertyValue
from plane.utils.host import base_host
from plane.utils.issue_property import (
    PropertyValueError,
    build_value_row,
    decode_wire_value,
    normalize_wire_values,
    stored_values_by_property,
)


def _is_uuid(value):
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def get_issue_property_values(issue_ids, project_id):
    """Return ``{issue_id: {property_id: [wire values]}}`` for the given issues."""
    properties_by_id = {prop.id: prop for prop in IssueProperty.objects.filter(project_id=project_id)}
    rows = (
        IssuePropertyValue.objects.filter(issue_id__in=issue_ids, project_id=project_id)
        .filter(property__deleted_at__isnull=True)
        .order_by("created_at")
    )
    grouped = {}
    for issue_id in issue_ids:
        grouped[str(issue_id)] = []
    for row in rows:
        grouped.setdefault(str(row.issue_id), []).append(row)
    return {
        issue_id: stored_values_by_property(issue_rows, properties_by_id) for issue_id, issue_rows in grouped.items()
    }


class IssuePropertyValueEndpoint(BaseAPIView):
    """
    GET  -> all custom property values of a work item: ``{property_id: [values]}``
    POST -> replace the values of the listed properties:
            ``{"property_values": {property_id: value | [values]}}``
    """

    permission_classes = [ProjectEntityPermission]

    def get_issue(self, slug, project_id, issue_id):
        return Issue.issue_objects.get(pk=issue_id, project_id=project_id, workspace__slug=slug)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        issue = self.get_issue(slug, project_id, issue_id)
        values = get_issue_property_values([issue.id], project_id)
        return Response(values.get(str(issue.id), {}), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = self.get_issue(slug, project_id, issue_id)
        payload = request.data.get("property_values")
        if not isinstance(payload, dict):
            return Response({"error": "property_values must be an object"}, status=status.HTTP_400_BAD_REQUEST)
        if not payload:
            values = get_issue_property_values([issue.id], project_id)
            return Response(values.get(str(issue.id), {}), status=status.HTTP_200_OK)

        property_ids = [key for key in payload.keys() if _is_uuid(key)]
        if len(property_ids) != len(payload):
            return Response({"error": "property_values keys must be property ids"}, status=status.HTTP_400_BAD_REQUEST)

        properties = {
            str(prop.id): prop
            for prop in IssueProperty.objects.filter(id__in=property_ids, project_id=project_id, is_active=True)
        }
        errors = {}
        decoded = {}
        for property_id, raw in payload.items():
            prop = properties.get(str(property_id))
            if prop is None:
                errors[str(property_id)] = "Unknown or inactive property"
                continue
            if issue.type_id != prop.issue_type_id:
                errors[str(property_id)] = "Property does not belong to the work item's type"
                continue
            wire_values = normalize_wire_values(raw)
            if not prop.is_multi and len(wire_values) > 1:
                errors[str(property_id)] = "This property accepts a single value"
                continue
            if prop.is_required and not wire_values:
                errors[str(property_id)] = f"{prop.display_name} is required"
                continue
            option_ids = None
            if prop.property_type == IssuePropertyTypeChoices.OPTION:
                option_ids = set(
                    IssuePropertyOption.objects.filter(property=prop, is_active=True).values_list("id", flat=True)
                )
            python_values = []
            try:
                for wire_value in wire_values:
                    python_values.append(decode_wire_value(prop, wire_value, option_ids=option_ids))
            except PropertyValueError as e:
                errors[str(property_id)] = str(e)
                continue
            decoded[str(property_id)] = (prop, python_values)

        if errors:
            return Response({"property_values": errors}, status=status.HTTP_400_BAD_REQUEST)

        before = get_issue_property_values([issue.id], project_id).get(str(issue.id), {})

        with transaction.atomic():
            IssuePropertyValue.objects.filter(issue=issue, property_id__in=list(decoded.keys())).delete(soft=False)
            rows = []
            for prop, python_values in decoded.values():
                for python_value in python_values:
                    rows.append(
                        build_value_row(
                            prop,
                            issue.id,
                            python_value,
                            created_by_id=request.user.id,
                            updated_by_id=request.user.id,
                        )
                    )
            if rows:
                IssuePropertyValue.objects.bulk_create(rows, batch_size=100)

        after = get_issue_property_values([issue.id], project_id).get(str(issue.id), {})

        changed = {
            property_id: after.get(property_id, [])
            for property_id in decoded.keys()
            if before.get(property_id, []) != after.get(property_id, [])
        }
        if changed:
            issue_activity.delay(
                type="issue_property.activity.updated",
                requested_data=json.dumps({"property_values": changed}, cls=DjangoJSONEncoder),
                current_instance=json.dumps(
                    {"property_values": {property_id: before.get(property_id, []) for property_id in changed}},
                    cls=DjangoJSONEncoder,
                ),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(project_id),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )

        return Response(after, status=status.HTTP_200_OK)


class IssuePropertyValueBatchEndpoint(BaseAPIView):
    """POST ``{"issue_ids": [...]}`` -> ``{issue_id: {property_id: [values]}}``."""

    permission_classes = [ProjectEntityPermission]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids") or []
        if not isinstance(issue_ids, list) or any(not _is_uuid(issue_id) for issue_id in issue_ids):
            return Response({"error": "issue_ids must be a list of ids"}, status=status.HTTP_400_BAD_REQUEST)
        if len(issue_ids) > 500:
            return Response({"error": "At most 500 issue ids per request"}, status=status.HTTP_400_BAD_REQUEST)
        visible_ids = list(
            Issue.all_objects.filter(id__in=issue_ids, project_id=project_id, workspace__slug=slug).values_list(
                "id", flat=True
            )
        )
        return Response(get_issue_property_values(visible_ids, project_id), status=status.HTTP_200_OK)
