# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Prefetch

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, ProjectBasePermission, allow_permission
from plane.app.serializers import IssuePropertyOptionSerializer, IssuePropertySerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import IssueProperty, IssuePropertyOption, IssuePropertyTypeChoices, IssueType, Project


class IssuePropertyViewSet(BaseViewSet):
    """CRUD for custom property definitions."""

    model = IssueProperty
    serializer_class = IssuePropertySerializer
    permission_classes = [ProjectBasePermission]

    def get_queryset(self):
        queryset = IssueProperty.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
        ).prefetch_related(Prefetch("options", queryset=IssuePropertyOption.objects.order_by("sort_order")))
        issue_type_id = self.kwargs.get("issue_type_id")
        if issue_type_id:
            queryset = queryset.filter(issue_type_id=issue_type_id)
        return queryset.order_by("sort_order", "created_at")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_type_id=None):
        queryset = self.get_queryset()
        if request.GET.get("is_active") in ("true", "false"):
            queryset = queryset.filter(is_active=request.GET.get("is_active") == "true")
        return Response(IssuePropertySerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        prop = self.get_queryset().get(pk=pk)
        return Response(IssuePropertySerializer(prop).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, issue_type_id):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        issue_type = IssueType.objects.get(
            pk=issue_type_id,
            project_issue_types__project_id=project_id,
            project_issue_types__deleted_at__isnull=True,
        )
        serializer = IssuePropertySerializer(
            data=request.data,
            context={"issue_type_id": issue_type.id, "project_id": project_id, "workspace_id": project.workspace_id},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            prop = serializer.save(issue_type=issue_type, project_id=project_id)
            # Allow options to be created in the same request for dropdown properties
            options = request.data.get("options") or []
            if prop.property_type == IssuePropertyTypeChoices.OPTION and isinstance(options, list):
                created = []
                for index, option in enumerate(options):
                    if not isinstance(option, dict):
                        continue
                    option_serializer = IssuePropertyOptionSerializer(data=option, context={"property_id": prop.id})
                    if not option_serializer.is_valid():
                        transaction.set_rollback(True)
                        return Response({"options": option_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
                    created.append(
                        option_serializer.save(property=prop, project_id=project_id, sort_order=(index + 1) * 10000)
                    )
                if not prop.is_multi:
                    _keep_single_default(prop, created)

        prop = self.get_queryset().get(pk=prop.id)
        return Response(IssuePropertySerializer(prop).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        prop = self.get_queryset().get(pk=pk)
        serializer = IssuePropertySerializer(
            prop,
            data=request.data,
            partial=True,
            context={"issue_type_id": prop.issue_type_id, "project_id": project_id, "workspace_id": prop.workspace_id},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        prop = self.get_queryset().get(pk=pk)
        return Response(IssuePropertySerializer(prop).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        prop = self.get_queryset().get(pk=pk)
        prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _keep_single_default(prop, options):
    """Single valued dropdowns can only have one default option."""
    defaults = [option for option in options if option.is_default]
    for extra in defaults[1:]:
        IssuePropertyOption.objects.filter(pk=extra.pk).update(is_default=False)


class IssuePropertyOptionViewSet(BaseViewSet):
    model = IssuePropertyOption
    serializer_class = IssuePropertyOptionSerializer
    permission_classes = [ProjectBasePermission]

    def get_queryset(self):
        return IssuePropertyOption.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
            property_id=self.kwargs.get("property_id"),
        ).order_by("sort_order", "created_at")

    def get_property(self, slug, project_id, property_id):
        return IssueProperty.objects.get(
            pk=property_id,
            project_id=project_id,
            workspace__slug=slug,
            property_type=IssuePropertyTypeChoices.OPTION,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, property_id):
        return Response(IssuePropertyOptionSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, property_id):
        prop = self.get_property(slug, project_id, property_id)
        serializer = IssuePropertyOptionSerializer(data=request.data, context={"property_id": prop.id})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            option = serializer.save(property=prop, project_id=project_id)
            if option.is_default and not prop.is_multi:
                IssuePropertyOption.objects.filter(property=prop).exclude(pk=option.pk).update(is_default=False)
        return Response(IssuePropertyOptionSerializer(option).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, property_id, pk):
        prop = self.get_property(slug, project_id, property_id)
        option = self.get_queryset().get(pk=pk)
        serializer = IssuePropertyOptionSerializer(
            option, data=request.data, partial=True, context={"property_id": prop.id}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            option = serializer.save()
            if option.is_default and not prop.is_multi:
                IssuePropertyOption.objects.filter(property=prop).exclude(pk=option.pk).update(is_default=False)
        return Response(IssuePropertyOptionSerializer(option).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, property_id, pk):
        option = self.get_queryset().get(pk=pk)
        option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
