# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Exists, OuterRef, Prefetch

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, ProjectBasePermission, allow_permission
from plane.app.serializers import IssueTypeSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Issue, IssueType, Project, ProjectIssueType
from plane.utils.issue_type import (
    enable_issue_types_for_project,
    get_project_default_issue_type,
    set_project_default_issue_type,
)


class IssueTypeViewSet(BaseViewSet):
    """CRUD for project scoped work item types."""

    model = IssueType
    serializer_class = IssueTypeSerializer
    permission_classes = [ProjectBasePermission]

    def get_queryset(self):
        project_id = self.kwargs.get("project_id")
        return (
            IssueType.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_issue_types__project_id=project_id,
                project_issue_types__deleted_at__isnull=True,
            )
            .prefetch_related(
                Prefetch(
                    "project_issue_types",
                    queryset=ProjectIssueType.objects.filter(project_id=project_id),
                )
            )
            .annotate(issue_exists=Exists(Issue.all_objects.filter(type_id=OuterRef("id"))))
            .order_by("-is_default", "level", "created_at")
            .distinct()
        )

    def serializer_context(self, slug, project_id):
        return {"project_id": project_id, "workspace_slug": slug}

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        serializer = IssueTypeSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().get(pk=pk)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        serializer = IssueTypeSerializer(data=request.data, context=self.serializer_context(slug, project_id))
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Make sure the project has a default type before adding more
            if not project.is_issue_type_enabled:
                project.is_issue_type_enabled = True
                project.save(update_fields=["is_issue_type_enabled"])
            enable_issue_types_for_project(project)

            make_default = bool(serializer.validated_data.pop("is_default", False))
            issue_type = serializer.save(workspace_id=project.workspace_id, is_default=False)
            ProjectIssueType.objects.create(
                project_id=project_id,
                issue_type=issue_type,
                is_default=False,
                level=issue_type.level or 0,
            )
            if make_default:
                set_project_default_issue_type(project_id, issue_type)

        issue_type = self.get_queryset().get(pk=issue_type.id)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().get(pk=pk)
        serializer = IssueTypeSerializer(
            issue_type, data=request.data, partial=True, context=self.serializer_context(slug, project_id)
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            make_default = serializer.validated_data.pop("is_default", None)
            if make_default is False and issue_type.is_default:
                return Response(
                    {"error": "Set another work item type as default first"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer.save()
            if make_default:
                set_project_default_issue_type(project_id, issue_type)

        issue_type = self.get_queryset().get(pk=pk)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().get(pk=pk)
        if issue_type.is_default:
            return Response(
                {"error": "The default work item type cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        default_type = get_project_default_issue_type(project_id)
        with transaction.atomic():
            # Existing work items fall back to the default type so they keep a type
            Issue.all_objects.filter(project_id=project_id, type_id=issue_type.id).update(
                type_id=default_type.id if default_type else None
            )
            ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=issue_type.id).delete()
            issue_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
