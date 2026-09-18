/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TIssuePropertyValues } from "@plane/types";
// services
import { IssueTypeService } from "@/services/issue-type/issue-type.service";
// types
import type { IIssueDetail } from "./root.store";

export interface IIssuePropertyValueStoreActions {
  fetchPropertyValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssuePropertyValues>;
  fetchPropertyValuesBatch: (workspaceSlug: string, projectId: string, issueIds: string[]) => Promise<void>;
  updatePropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyValues: TIssuePropertyValues
  ) => Promise<TIssuePropertyValues>;
}

export interface IIssuePropertyValueStore extends IIssuePropertyValueStoreActions {
  // observables
  propertyValuesByIssue: Record<string, TIssuePropertyValues>;
  fetchedIssueMap: Record<string, boolean>;
  // helpers
  getPropertyValuesByIssueId: (issueId: string | null | undefined) => TIssuePropertyValues | undefined;
  isIssueFetched: (issueId: string | null | undefined) => boolean;
}

export class IssuePropertyValueStore implements IIssuePropertyValueStore {
  // observables
  propertyValuesByIssue: Record<string, TIssuePropertyValues> = {};
  fetchedIssueMap: Record<string, boolean> = {};
  // root store
  rootIssueDetailStore: IIssueDetail;
  // services
  issueTypeService: IssueTypeService;

  constructor(rootStore: IIssueDetail) {
    makeObservable(this, {
      propertyValuesByIssue: observable,
      fetchedIssueMap: observable,
      fetchPropertyValues: action,
      fetchPropertyValuesBatch: action,
      updatePropertyValues: action,
    });
    this.rootIssueDetailStore = rootStore;
    this.issueTypeService = new IssueTypeService();
  }

  getPropertyValuesByIssueId = computedFn((issueId: string | null | undefined) =>
    issueId ? this.propertyValuesByIssue[issueId] : undefined
  );

  isIssueFetched = computedFn((issueId: string | null | undefined) => !!issueId && !!this.fetchedIssueMap[issueId]);

  fetchPropertyValues = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const values = await this.issueTypeService.fetchIssuePropertyValues(workspaceSlug, projectId, issueId);
    runInAction(() => {
      set(this.propertyValuesByIssue, issueId, values ?? {});
      set(this.fetchedIssueMap, issueId, true);
    });
    return values;
  };

  fetchPropertyValuesBatch = async (workspaceSlug: string, projectId: string, issueIds: string[]) => {
    if (issueIds.length === 0) return;
    const values = await this.issueTypeService.fetchIssuePropertyValuesBatch(workspaceSlug, projectId, issueIds);
    runInAction(() => {
      Object.entries(values ?? {}).forEach(([issueId, issueValues]) => {
        set(this.propertyValuesByIssue, issueId, issueValues ?? {});
        set(this.fetchedIssueMap, issueId, true);
      });
    });
  };

  updatePropertyValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    propertyValues: TIssuePropertyValues
  ) => {
    const previous = this.propertyValuesByIssue[issueId];
    // optimistic update
    runInAction(() => {
      set(this.propertyValuesByIssue, issueId, { ...previous, ...propertyValues });
    });
    try {
      const values = await this.issueTypeService.updateIssuePropertyValues(
        workspaceSlug,
        projectId,
        issueId,
        propertyValues
      );
      runInAction(() => {
        set(this.propertyValuesByIssue, issueId, values ?? {});
        set(this.fetchedIssueMap, issueId, true);
      });
      return values;
    } catch (error) {
      runInAction(() => {
        set(this.propertyValuesByIssue, issueId, previous ?? {});
      });
      throw error;
    }
  };
}
