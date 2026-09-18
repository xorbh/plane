# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyRelationTypeChoices,
    IssuePropertyTypeChoices,
    IssueType,
    ProjectIssueType,
)
from plane.utils.issue_property import PropertyValueError, decode_wire_value, normalize_wire_values


TEXT_DISPLAY_FORMATS = {"single-line", "multi-line", "read-only"}
DATE_DISPLAY_FORMATS = {"MMM dd, yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy/MM/dd"}
MULTI_CAPABLE_TYPES = {IssuePropertyTypeChoices.OPTION, IssuePropertyTypeChoices.RELATION}


class IssueTypeSerializer(BaseSerializer):
    """Project scoped work item type."""

    project_ids = serializers.SerializerMethodField(read_only=True)
    issue_exists = serializers.BooleanField(read_only=True, required=False)

    class Meta:
        model = IssueType
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_default",
            "is_active",
            "level",
            "workspace",
            "project_ids",
            "issue_exists",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "is_epic",
            "workspace",
            "project_ids",
            "issue_exists",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_project_ids(self, obj):
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("project_issue_types")
        if prefetched is not None:
            return [str(pit.project_id) for pit in prefetched]
        return [
            str(pid) for pid in ProjectIssueType.objects.filter(issue_type=obj).values_list("project_id", flat=True)
        ]

    def validate_name(self, value):
        project_id = self.context.get("project_id")
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name is required")
        queryset = IssueType.objects.filter(
            project_issue_types__project_id=project_id,
            project_issue_types__deleted_at__isnull=True,
            name__iexact=name,
        )
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("A work item type with this name already exists in the project")
        return name

    def validate(self, attrs):
        if self.instance and self.instance.is_default and attrs.get("is_active") is False:
            raise serializers.ValidationError({"is_active": "The default work item type cannot be disabled"})
        return attrs


class IssuePropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyOption
        fields = [
            "id",
            "property",
            "name",
            "description",
            "sort_order",
            "is_default",
            "is_active",
            "logo_props",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "property", "created_at", "updated_at"]

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name is required")
        property_id = self.context.get("property_id") or (self.instance.property_id if self.instance else None)
        queryset = IssuePropertyOption.objects.filter(property_id=property_id, name__iexact=name)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("An option with this name already exists")
        return name


class IssuePropertySerializer(BaseSerializer):
    options = IssuePropertyOptionSerializer(many=True, read_only=True)

    class Meta:
        model = IssueProperty
        fields = [
            "id",
            "issue_type",
            "display_name",
            "description",
            "property_type",
            "relation_type",
            "is_required",
            "is_active",
            "is_multi",
            "default_value",
            "settings",
            "validation_rules",
            "logo_props",
            "sort_order",
            "options",
            "project",
            "workspace",
            "external_source",
            "external_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "issue_type",
            "options",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_display_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Title is required")
        issue_type_id = self.context.get("issue_type_id") or (self.instance.issue_type_id if self.instance else None)
        queryset = IssueProperty.objects.filter(issue_type_id=issue_type_id, display_name__iexact=name)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("A property with this title already exists on this work item type")
        return name

    def validate(self, attrs):
        instance = self.instance
        property_type = attrs.get("property_type", instance.property_type if instance else None)
        if not property_type:
            raise serializers.ValidationError({"property_type": "Property type is required"})

        if instance and "property_type" in attrs and attrs["property_type"] != instance.property_type:
            raise serializers.ValidationError({"property_type": "The type of a property cannot be changed"})

        relation_type = attrs.get("relation_type", instance.relation_type if instance else None)
        if property_type == IssuePropertyTypeChoices.RELATION:
            if relation_type not in IssuePropertyRelationTypeChoices.values:
                raise serializers.ValidationError(
                    {"relation_type": "Relation type is required for relation properties"}
                )
            if instance and "relation_type" in attrs and attrs["relation_type"] != instance.relation_type:
                raise serializers.ValidationError(
                    {"relation_type": "The relation type of a property cannot be changed"}
                )
        else:
            attrs["relation_type"] = None

        is_multi = attrs.get("is_multi", instance.is_multi if instance else False)
        if is_multi and property_type not in MULTI_CAPABLE_TYPES:
            raise serializers.ValidationError(
                {"is_multi": "Only dropdown and relation properties can hold multiple values"}
            )
        if instance and "is_multi" in attrs and attrs["is_multi"] is False and instance.is_multi:
            raise serializers.ValidationError({"is_multi": "A multi-value property cannot be changed to single value"})

        is_required = attrs.get("is_required", instance.is_required if instance else False)
        settings = attrs.get("settings", instance.settings if instance else {}) or {}
        if not isinstance(settings, dict):
            raise serializers.ValidationError({"settings": "Settings must be an object"})
        if property_type == IssuePropertyTypeChoices.BOOLEAN and is_required:
            raise serializers.ValidationError({"is_required": "Boolean properties cannot be mandatory"})
        if property_type == IssuePropertyTypeChoices.TEXT:
            display_format = settings.get("display_format", "single-line")
            if display_format not in TEXT_DISPLAY_FORMATS:
                raise serializers.ValidationError({"settings": "Invalid text display format"})
            if display_format == "read-only" and is_required:
                raise serializers.ValidationError({"is_required": "Read-only text properties cannot be mandatory"})
        if property_type == IssuePropertyTypeChoices.DATETIME:
            display_format = settings.get("display_format", "MMM dd, yyyy")
            if display_format not in DATE_DISPLAY_FORMATS:
                raise serializers.ValidationError({"settings": "Invalid date display format"})

        validation_rules = attrs.get("validation_rules", instance.validation_rules if instance else {}) or {}
        if not isinstance(validation_rules, dict):
            raise serializers.ValidationError({"validation_rules": "Validation rules must be an object"})
        if property_type == IssuePropertyTypeChoices.DECIMAL:
            minimum, maximum = validation_rules.get("min"), validation_rules.get("max")
            for key, bound in (("min", minimum), ("max", maximum)):
                if bound is not None and (isinstance(bound, bool) or not isinstance(bound, (int, float))):
                    raise serializers.ValidationError({"validation_rules": f"'{key}' must be a number"})
            if minimum is not None and maximum is not None and minimum > maximum:
                raise serializers.ValidationError({"validation_rules": "'min' must not exceed 'max'"})

        # Default values are wire encoded lists. Option defaults are managed via option.is_default.
        if "default_value" in attrs:
            defaults = normalize_wire_values(attrs["default_value"])
            if property_type == IssuePropertyTypeChoices.OPTION:
                defaults = []
            elif defaults:
                if not is_multi and len(defaults) > 1:
                    raise serializers.ValidationError({"default_value": "Only one default value is allowed"})
                probe = IssueProperty(
                    property_type=property_type,
                    relation_type=relation_type,
                    validation_rules=validation_rules,
                    project_id=self.context.get("project_id") or (instance.project_id if instance else None),
                    workspace_id=self.context.get("workspace_id") or (instance.workspace_id if instance else None),
                )
                if property_type == IssuePropertyTypeChoices.RELATION:
                    # Relation defaults are not supported
                    raise serializers.ValidationError(
                        {"default_value": "Relation properties cannot have a default value"}
                    )
                try:
                    for value in defaults:
                        decode_wire_value(probe, value)
                except PropertyValueError as e:
                    raise serializers.ValidationError({"default_value": str(e)})
            attrs["default_value"] = defaults

        return attrs


class IssuePropertyLiteSerializer(BaseSerializer):
    class Meta:
        model = IssueProperty
        fields = ["id", "display_name", "property_type", "relation_type", "is_multi", "is_required", "is_active"]
        read_only_fields = fields
