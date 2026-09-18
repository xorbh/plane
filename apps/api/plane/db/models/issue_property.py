# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Custom properties ("custom fields") for work items.

Properties are defined per work item type (see ``IssueType`` / ``ProjectIssueType``)
and are project scoped in this fork. Values are stored one row per value in typed
columns so that they can be filtered, ordered and grouped with plain SQL.
"""

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class IssuePropertyTypeChoices(models.TextChoices):
    TEXT = "TEXT", "Text"
    DATETIME = "DATETIME", "Date"
    DECIMAL = "DECIMAL", "Number"
    BOOLEAN = "BOOLEAN", "Boolean"
    OPTION = "OPTION", "Dropdown"
    RELATION = "RELATION", "Relation"
    URL = "URL", "URL"
    EMAIL = "EMAIL", "Email"


class IssuePropertyRelationTypeChoices(models.TextChoices):
    ISSUE = "ISSUE", "Work item"
    USER = "USER", "Member"


class IssueProperty(ProjectBaseModel):
    """A custom field definition attached to a work item type."""

    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.CASCADE,
        related_name="properties",
    )
    display_name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    property_type = models.CharField(
        max_length=20,
        choices=IssuePropertyTypeChoices.choices,
        default=IssuePropertyTypeChoices.TEXT,
    )
    # Only meaningful when property_type == RELATION
    relation_type = models.CharField(
        max_length=20,
        choices=IssuePropertyRelationTypeChoices.choices,
        null=True,
        blank=True,
    )
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_multi = models.BooleanField(default=False)
    # Default value(s), always stored as a list of wire-encoded values.
    default_value = models.JSONField(default=list, blank=True)
    # Type specific presentation settings, e.g. {"display_format": "single-line"}
    settings = models.JSONField(default=dict, blank=True)
    # Type specific validation, e.g. {"min": 0, "max": 100}
    validation_rules = models.JSONField(default=dict, blank=True)
    logo_props = models.JSONField(default=dict, blank=True)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Property"
        verbose_name_plural = "Issue Properties"
        db_table = "issue_properties"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["issue_type", "display_name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_unique_type_display_name_when_deleted_at_null",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            last_order = IssueProperty.objects.filter(issue_type=self.issue_type).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last_order is not None:
                self.sort_order = last_order + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.display_name} ({self.property_type})"


class IssuePropertyOption(ProjectBaseModel):
    """A selectable option for an OPTION typed property."""

    property = models.ForeignKey(
        IssueProperty,
        on_delete=models.CASCADE,
        related_name="options",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    sort_order = models.FloatField(default=65535)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    logo_props = models.JSONField(default=dict, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Property Option"
        verbose_name_plural = "Issue Property Options"
        db_table = "issue_property_options"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["property", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_option_unique_property_name_when_deleted_at_null",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            last_order = IssuePropertyOption.objects.filter(property=self.property).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last_order is not None:
                self.sort_order = last_order + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class IssuePropertyValue(ProjectBaseModel):
    """
    One value of a property on a work item.

    Single-valued properties have at most one row per (issue, property); multi-valued
    properties have one row per selected value. Exactly one ``value_*`` column is
    populated depending on ``property.property_type``.
    """

    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="property_values",
    )
    property = models.ForeignKey(
        IssueProperty,
        on_delete=models.CASCADE,
        related_name="values",
    )
    value_text = models.TextField(blank=True, null=True)
    value_decimal = models.DecimalField(max_digits=30, decimal_places=10, null=True, blank=True)
    value_datetime = models.DateTimeField(null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)
    # RELATION values (issue id or user id)
    value_uuid = models.UUIDField(null=True, blank=True)
    # OPTION values
    value_option = models.ForeignKey(
        IssuePropertyOption,
        on_delete=models.CASCADE,
        related_name="values",
        null=True,
        blank=True,
    )
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Property Value"
        verbose_name_plural = "Issue Property Values"
        db_table = "issue_property_values"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["issue", "property"], name="ipv_issue_property_idx"),
            models.Index(fields=["property", "value_option"], name="ipv_property_option_idx"),
            models.Index(fields=["property", "value_uuid"], name="ipv_property_uuid_idx"),
        ]

    def __str__(self):
        return f"{self.issue_id} - {self.property_id}"
