/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueProperty,
  TIssuePropertyOption,
  TIssuePropertyPayload,
  TIssuePropertyValues,
  TIssuePropertyValuesByIssue,
  TIssueType,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}`;
  }

  // ---------------------------------------------------------------- types

  async fetchIssueTypes(workspaceSlug: string, projectId: string): Promise<TIssueType[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueType(workspaceSlug: string, projectId: string, data: Partial<TIssueType>): Promise<TIssueType> {
    return this.post(`${this.base(workspaceSlug, projectId)}/issue-types/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueType(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: Partial<TIssueType>
  ): Promise<TIssueType> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/issue-types/${issueTypeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueType(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/issue-types/${issueTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ----------------------------------------------------------- properties

  async fetchIssueProperties(workspaceSlug: string, projectId: string): Promise<TIssueProperty[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/issue-properties/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueProperty(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssuePropertyPayload
  ): Promise<TIssueProperty> {
    return this.post(`${this.base(workspaceSlug, projectId)}/issue-types/${issueTypeId}/issue-properties/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueProperty(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: TIssuePropertyPayload
  ): Promise<TIssueProperty> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/issue-properties/${propertyId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueProperty(workspaceSlug: string, projectId: string, propertyId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/issue-properties/${propertyId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // -------------------------------------------------------------- options

  async createIssuePropertyOption(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption> {
    return this.post(`${this.base(workspaceSlug, projectId)}/issue-properties/${propertyId}/options/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssuePropertyOption(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssuePropertyOption>
  ): Promise<TIssuePropertyOption> {
    return this.patch(
      `${this.base(workspaceSlug, projectId)}/issue-properties/${propertyId}/options/${optionId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssuePropertyOption(
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string
  ): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/issue-properties/${propertyId}/options/${optionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // --------------------------------------------------------------- values

  async fetchIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssuePropertyValues> {
    return this.get(`${this.base(workspaceSlug, projectId)}/issues/${issueId}/issue-property-values/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyValues: TIssuePropertyValues
  ): Promise<TIssuePropertyValues> {
    return this.post(`${this.base(workspaceSlug, projectId)}/issues/${issueId}/issue-property-values/`, {
      property_values: propertyValues,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchIssuePropertyValuesBatch(
    workspaceSlug: string,
    projectId: string,
    issueIds: string[]
  ): Promise<TIssuePropertyValuesByIssue> {
    return this.post(`${this.base(workspaceSlug, projectId)}/issue-property-values/batch/`, { issue_ids: issueIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
