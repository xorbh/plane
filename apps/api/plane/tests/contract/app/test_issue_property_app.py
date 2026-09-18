# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for project scoped work item types and custom properties."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.celery import app as celery_app
from plane.db.models import (
    Issue,
    IssueActivity,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)


@pytest.fixture(autouse=True)
def celery_eager():
    original = celery_app.conf.task_always_eager
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = False
    yield
    celery_app.conf.task_always_eager = original


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Custom Fields Project",
        identifier="CFP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    State.objects.create(name="Todo", project=project, workspace=workspace, group="backlog", default=True)
    return project


@pytest.fixture
def guest_client(db, workspace, project):
    guest = User.objects.create(email=f"guest-{uuid4().hex[:6]}@plane.so", username=f"guest_{uuid4().hex[:6]}")
    WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
    ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
    client = APIClient()
    client.force_authenticate(user=guest)
    return client


def base_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/"


def enable_types(session_client, workspace, project):
    response = session_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/",
        {"is_issue_type_enabled": True},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK, response.json()
    return IssueType.objects.get(project_issue_types__project_id=project.id, is_default=True)


def create_property(session_client, workspace, project, issue_type, **overrides):
    payload = {"display_name": "Severity", "property_type": "TEXT"}
    payload.update(overrides)
    response = session_client.post(
        base_url(workspace, project) + f"issue-types/{issue_type.id}/issue-properties/",
        payload,
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED, response.json()
    return response.json()


def create_issue(project, issue_type=None, name="Work item"):
    return Issue.objects.create(
        name=name,
        project=project,
        workspace=project.workspace,
        state=State.objects.filter(project=project).first(),
        type=issue_type,
    )


@pytest.mark.contract
class TestIssueTypeEnablement:
    @pytest.mark.django_db
    def test_enabling_feature_seeds_default_type_and_backfills_issues(self, session_client, workspace, project):
        untyped = create_issue(project, None)
        default_type = enable_types(session_client, workspace, project)

        assert default_type.name == "Task"
        assert ProjectIssueType.objects.filter(project=project, issue_type=default_type, is_default=True).exists()
        untyped.refresh_from_db()
        assert untyped.type_id == default_type.id

        # Enabling twice is idempotent
        enable_types(session_client, workspace, project)
        assert IssueType.objects.filter(project_issue_types__project_id=project.id).count() == 1

    @pytest.mark.django_db
    def test_new_issues_get_default_type(self, session_client, workspace, project):
        default_type = enable_types(session_client, workspace, project)
        response = session_client.post(base_url(workspace, project) + "issues/", {"name": "Typed"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        assert Issue.objects.get(pk=response.json()["id"]).type_id == default_type.id
        assert response.json()["type_id"] == str(default_type.id)

    @pytest.mark.django_db
    def test_issue_list_exposes_type_id(self, session_client, workspace, project):
        default_type = enable_types(session_client, workspace, project)
        create_issue(project, default_type)
        response = session_client.get(base_url(workspace, project) + "issues/")
        assert response.status_code == status.HTTP_200_OK
        results = response.json()["results"]
        assert results[0]["type_id"] == str(default_type.id)


@pytest.mark.contract
class TestIssueTypeAPI:
    @pytest.mark.django_db
    def test_create_list_update_delete_type(self, session_client, workspace, project):
        url = base_url(workspace, project) + "issue-types/"
        response = session_client.post(url, {"name": "Bug", "description": "Defects"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        bug_id = response.json()["id"]
        assert response.json()["is_default"] is False
        assert response.json()["project_ids"] == [str(project.id)]
        # Creating the first type turns the feature on and seeds the default type
        project.refresh_from_db()
        assert project.is_issue_type_enabled is True

        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        names = {item["name"]: item for item in response.json()}
        assert set(names) == {"Task", "Bug"}
        assert names["Task"]["is_default"] is True

        # duplicate names are rejected
        response = session_client.post(url, {"name": "bug"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # make Bug the default
        response = session_client.patch(url + f"{bug_id}/", {"is_default": True}, format="json")
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()["is_default"] is True
        assert IssueType.objects.filter(project_issue_types__project_id=project.id, is_default=True).count() == 1

        # default cannot be disabled or deleted
        response = session_client.patch(url + f"{bug_id}/", {"is_active": False}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response = session_client.delete(url + f"{bug_id}/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # deleting a non-default type moves its work items to the default type
        task = IssueType.objects.get(project_issue_types__project_id=project.id, name="Task")
        issue = create_issue(project, task)
        response = session_client.delete(url + f"{task.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert str(issue.type_id) == bug_id
        assert not ProjectIssueType.objects.filter(project=project, issue_type_id=task.id).exists()

    @pytest.mark.django_db
    def test_guest_can_list_but_not_create(self, session_client, guest_client, workspace, project):
        url = base_url(workspace, project) + "issue-types/"
        response = guest_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        response = guest_client.post(url, {"name": "Bug"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestIssuePropertyAPI:
    @pytest.mark.django_db
    def test_create_property_with_options(self, session_client, workspace, project):
        issue_type = enable_types(session_client, workspace, project)
        data = create_property(
            session_client,
            workspace,
            project,
            issue_type,
            display_name="Priority band",
            property_type="OPTION",
            options=[{"name": "P0", "is_default": True}, {"name": "P1", "is_default": True}, {"name": "P2"}],
        )
        assert data["property_type"] == "OPTION"
        assert [option["name"] for option in data["options"]] == ["P0", "P1", "P2"]
        # single valued dropdowns keep exactly one default
        assert [option["is_default"] for option in data["options"]] == [True, False, False]

        # listing by type and by project both return the property
        response = session_client.get(base_url(workspace, project) + "issue-properties/")
        assert response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in response.json()] == [data["id"]]

    @pytest.mark.django_db
    def test_property_validation_rules(self, session_client, workspace, project):
        issue_type = enable_types(session_client, workspace, project)
        url = base_url(workspace, project) + f"issue-types/{issue_type.id}/issue-properties/"

        response = session_client.post(
            url, {"display_name": "Done?", "property_type": "BOOLEAN", "is_required": True}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "is_required" in response.json()

        response = session_client.post(url, {"display_name": "Owner", "property_type": "RELATION"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "relation_type" in response.json()

        response = session_client.post(
            url, {"display_name": "Notes", "property_type": "TEXT", "is_multi": True}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "is_multi" in response.json()

        response = session_client.post(
            url,
            {"display_name": "Score", "property_type": "DECIMAL", "validation_rules": {"min": 10, "max": 1}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = session_client.post(
            url, {"display_name": "Score", "property_type": "DECIMAL", "default_value": ["abc"]}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "default_value" in response.json()

        response = session_client.post(
            url, {"display_name": "Score", "property_type": "DECIMAL", "default_value": 5}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        assert response.json()["default_value"] == [5]

        # type cannot be changed afterwards
        response = session_client.patch(
            base_url(workspace, project) + f"issue-properties/{response.json()['id']}/",
            {"property_type": "TEXT"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_option_crud(self, session_client, workspace, project):
        issue_type = enable_types(session_client, workspace, project)
        prop = create_property(
            session_client, workspace, project, issue_type, display_name="Area", property_type="OPTION"
        )
        url = base_url(workspace, project) + f"issue-properties/{prop['id']}/options/"

        response = session_client.post(url, {"name": "Frontend"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        option_id = response.json()["id"]
        response = session_client.post(url, {"name": "frontend"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = session_client.patch(url + f"{option_id}/", {"name": "Web", "is_default": True}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "Web"

        response = session_client.delete(url + f"{option_id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssuePropertyOption.objects.filter(pk=option_id).exists()

    @pytest.mark.django_db
    def test_guest_cannot_manage_properties(self, session_client, guest_client, workspace, project):
        issue_type = enable_types(session_client, workspace, project)
        url = base_url(workspace, project) + f"issue-types/{issue_type.id}/issue-properties/"
        response = guest_client.post(url, {"display_name": "X", "property_type": "TEXT"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestIssuePropertyValueAPI:
    @pytest.fixture
    def setup(self, session_client, workspace, project, create_user):
        issue_type = enable_types(session_client, workspace, project)
        text = create_property(session_client, workspace, project, issue_type, display_name="Customer")
        number = create_property(
            session_client,
            workspace,
            project,
            issue_type,
            display_name="Effort",
            property_type="DECIMAL",
            validation_rules={"min": 0, "max": 100},
        )
        flag = create_property(
            session_client, workspace, project, issue_type, display_name="Billable", property_type="BOOLEAN"
        )
        date = create_property(
            session_client, workspace, project, issue_type, display_name="Due review", property_type="DATETIME"
        )
        dropdown = create_property(
            session_client,
            workspace,
            project,
            issue_type,
            display_name="Area",
            property_type="OPTION",
            is_multi=True,
            options=[{"name": "Web"}, {"name": "API"}],
        )
        member = create_property(
            session_client,
            workspace,
            project,
            issue_type,
            display_name="Reviewer",
            property_type="RELATION",
            relation_type="USER",
        )
        required = create_property(
            session_client,
            workspace,
            project,
            issue_type,
            display_name="Ticket",
            property_type="TEXT",
            is_required=True,
        )
        issue = create_issue(project, issue_type)
        return {
            "issue_type": issue_type,
            "issue": issue,
            "text": text,
            "number": number,
            "flag": flag,
            "date": date,
            "dropdown": dropdown,
            "member": member,
            "required": required,
        }

    def values_url(self, workspace, project, issue):
        return base_url(workspace, project) + f"issues/{issue.id}/issue-property-values/"

    @pytest.mark.django_db
    def test_set_and_get_values(self, session_client, workspace, project, create_user, setup):
        issue = setup["issue"]
        option_ids = [option["id"] for option in setup["dropdown"]["options"]]
        payload = {
            "property_values": {
                setup["text"]["id"]: "ACME",
                setup["number"]["id"]: 12.5,
                setup["flag"]["id"]: True,
                setup["date"]["id"]: "2026-10-01",
                setup["dropdown"]["id"]: option_ids,
                setup["member"]["id"]: str(create_user.id),
            }
        }
        response = session_client.post(self.values_url(workspace, project, issue), payload, format="json")
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()[setup["text"]["id"]] == ["ACME"]
        assert response.json()[setup["number"]["id"]] == [12.5]
        assert response.json()[setup["flag"]["id"]] == [True]
        assert response.json()[setup["date"]["id"]][0].startswith("2026-10-01")
        assert set(response.json()[setup["dropdown"]["id"]]) == set(option_ids)
        assert response.json()[setup["member"]["id"]] == [str(create_user.id)]

        # GET returns the same shape
        response = session_client.get(self.values_url(workspace, project, issue))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()[setup["text"]["id"]] == ["ACME"]

        # replacing one property leaves the others untouched, clearing works with []
        response = session_client.post(
            self.values_url(workspace, project, issue),
            {"property_values": {setup["text"]["id"]: "Globex", setup["dropdown"]["id"]: []}},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()[setup["text"]["id"]] == ["Globex"]
        assert setup["dropdown"]["id"] not in response.json()
        assert response.json()[setup["number"]["id"]] == [12.5]
        assert IssuePropertyValue.objects.filter(issue=issue).count() == 5

        # activity was recorded per changed property
        activities = IssueActivity.objects.filter(issue=issue, field="issue_property")
        assert activities.count() == 8
        latest = activities.filter(new_identifier=setup["text"]["id"]).order_by("-created_at").first()
        assert latest.old_value == "ACME" and latest.new_value == "Globex"

    @pytest.mark.django_db
    def test_value_validation(self, session_client, workspace, project, setup):
        issue = setup["issue"]
        url = self.values_url(workspace, project, issue)

        def post(values):
            return session_client.post(url, {"property_values": values}, format="json")

        response = post({setup["number"]["id"]: "not a number"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert setup["number"]["id"] in response.json()["property_values"]

        response = post({setup["number"]["id"]: 500})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = post({setup["text"]["id"]: ["a", "b"]})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = post({setup["dropdown"]["id"]: [str(uuid4())]})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = post({setup["member"]["id"]: str(uuid4())})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = post({setup["required"]["id"]: ""})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        response = post({str(uuid4()): "x"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # nothing was written by the failed requests
        assert IssuePropertyValue.objects.filter(issue=issue).count() == 0

    @pytest.mark.django_db
    def test_property_must_match_issue_type(self, session_client, workspace, project, setup):
        response = session_client.post(base_url(workspace, project) + "issue-types/", {"name": "Bug"}, format="json")
        bug = IssueType.objects.get(pk=response.json()["id"])
        bug_issue = create_issue(project, bug)
        response = session_client.post(
            self.values_url(workspace, project, bug_issue),
            {"property_values": {setup["text"]["id"]: "ACME"}},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_batch_values(self, session_client, workspace, project, setup):
        first = setup["issue"]
        second = create_issue(project, setup["issue_type"], name="Second")
        session_client.post(
            self.values_url(workspace, project, first), {"property_values": {setup["text"]["id"]: "A"}}, format="json"
        )
        session_client.post(
            self.values_url(workspace, project, second), {"property_values": {setup["text"]["id"]: "B"}}, format="json"
        )
        response = session_client.post(
            base_url(workspace, project) + "issue-property-values/batch/",
            {"issue_ids": [str(first.id), str(second.id), str(uuid4())]},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.json()
        assert response.json()[str(first.id)][setup["text"]["id"]] == ["A"]
        assert response.json()[str(second.id)][setup["text"]["id"]] == ["B"]
        assert len(response.json()) == 2

    @pytest.mark.django_db
    def test_guest_can_read_but_not_write(self, session_client, guest_client, workspace, project, setup):
        issue = setup["issue"]
        response = guest_client.get(self.values_url(workspace, project, issue))
        assert response.status_code == status.HTTP_200_OK
        response = guest_client.post(
            self.values_url(workspace, project, issue), {"property_values": {setup["text"]["id"]: "x"}}, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_deleting_property_hides_values(self, session_client, workspace, project, setup):
        issue = setup["issue"]
        session_client.post(
            self.values_url(workspace, project, issue), {"property_values": {setup["text"]["id"]: "A"}}, format="json"
        )
        response = session_client.delete(base_url(workspace, project) + f"issue-properties/{setup['text']['id']}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueProperty.objects.filter(pk=setup["text"]["id"]).exists()
        response = session_client.get(self.values_url(workspace, project, issue))
        assert setup["text"]["id"] not in response.json()
