# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Helpers for project scoped work item types."""

# Django imports
from django.db import transaction

# Module imports
from plane.db.models import Issue, IssueType, ProjectIssueType

DEFAULT_ISSUE_TYPE_NAME = "Task"
DEFAULT_ISSUE_TYPE_LOGO = {
    "in_use": "icon",
    "icon": {"name": "Layers", "color": "#6695FF", "background_color": "#E5EAFF"},
}


def get_project_default_issue_type(project_id):
    """Return the default ``IssueType`` for a project, or ``None``."""
    return (
        IssueType.objects.filter(
            project_issue_types__project_id=project_id,
            project_issue_types__deleted_at__isnull=True,
            is_default=True,
        )
        .order_by("created_at")
        .first()
    )


def set_project_default_issue_type(project_id, issue_type):
    """Make ``issue_type`` the single default type of the project."""
    with transaction.atomic():
        IssueType.objects.filter(
            project_issue_types__project_id=project_id,
            project_issue_types__deleted_at__isnull=True,
        ).exclude(id=issue_type.id).update(is_default=False)
        ProjectIssueType.objects.filter(project_id=project_id).exclude(issue_type_id=issue_type.id).update(
            is_default=False
        )
        IssueType.objects.filter(id=issue_type.id).update(is_default=True, is_active=True)
        ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=issue_type.id).update(is_default=True)


def enable_issue_types_for_project(project):
    """
    Idempotently turn on work item types for a project: seed the default "Task"
    type if the project has no default type and assign it to every work item that
    has no type yet.
    """
    with transaction.atomic():
        default_type = get_project_default_issue_type(project.id)
        if default_type is None:
            default_type = IssueType.objects.create(
                workspace_id=project.workspace_id,
                name=DEFAULT_ISSUE_TYPE_NAME,
                description="",
                logo_props=DEFAULT_ISSUE_TYPE_LOGO,
                is_default=True,
                is_active=True,
                level=0,
            )
            ProjectIssueType.objects.create(
                project_id=project.id,
                issue_type=default_type,
                is_default=True,
                level=0,
            )
        Issue.all_objects.filter(project_id=project.id, type__isnull=True).update(type_id=default_type.id)
        return default_type
