/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TIssueProperty, TIssuePropertyOption, TIssuePropertyPayload, TIssueType } from "@plane/types";
// services
import { IssueTypeService } from "@/services/issue-type/issue-type.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IIssueTypeStore {
  // observables
  loaderMap: Record<string, boolean>;
  fetchedMap: Record<string, boolean>;
  issueTypeMap: Record<string, TIssueType>;
  propertyMap: Record<string, TIssueProperty>;
  // helpers
  isProjectFetched: (projectId: string | null | undefined) => boolean;
  getProjectIssueTypeIds: (projectId: string | null | undefined, activeOnly: boolean) => string[];
  getProjectIssueTypes: (projectId: string | null | undefined, activeOnly: boolean) => TIssueType[];
  getIssueTypeById: (issueTypeId: string | null | undefined) => TIssueType | undefined;
  getProjectDefaultIssueTypeId: (projectId: string | null | undefined) => string | null;
  getPropertiesByIssueTypeId: (issueTypeId: string | null | undefined, activeOnly: boolean) => TIssueProperty[];
  getPropertyById: (propertyId: string | null | undefined) => TIssueProperty | undefined;
  // fetch
  fetchProjectIssueTypes: (workspaceSlug: string, projectId: string, force?: boolean) => Promise<void>;
  // type crud
  createIssueType: (workspaceSlug: string, projectId: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  updateIssueType: (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: Partial<TIssueType>
  ) => Promise<TIssueType>;
  deleteIssueType: (workspaceSlug: string, projectId: string, issueTypeId: string) => Promise<void>;
  // property crud
  createIssueProperty: (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssuePropertyPayload
  ) => Promise<TIssueProperty>;
  updateIssueProperty: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: TIssuePropertyPayload
  ) => Promise<TIssueProperty>;
  deleteIssueProperty: (workspaceSlug: string, projectId: string, propertyId: string) => Promise<void>;
  // option crud
  createIssuePropertyOption: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssuePropertyOption>
  ) => Promise<TIssuePropertyOption>;
  updateIssuePropertyOption: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssuePropertyOption>
  ) => Promise<TIssuePropertyOption>;
  deleteIssuePropertyOption: (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string
  ) => Promise<void>;
}

export class IssueTypeStore implements IIssueTypeStore {
  // observables
  loaderMap: Record<string, boolean> = {};
  fetchedMap: Record<string, boolean> = {};
  issueTypeMap: Record<string, TIssueType> = {};
  propertyMap: Record<string, TIssueProperty> = {};
  // root store
  rootStore: CoreRootStore;
  // services
  issueTypeService: IssueTypeService;

  constructor(rootStore: CoreRootStore) {
    makeObservable(this, {
      loaderMap: observable,
      fetchedMap: observable,
      issueTypeMap: observable,
      propertyMap: observable,
      fetchProjectIssueTypes: action,
      createIssueType: action,
      updateIssueType: action,
      deleteIssueType: action,
      createIssueProperty: action,
      updateIssueProperty: action,
      deleteIssueProperty: action,
      createIssuePropertyOption: action,
      updateIssuePropertyOption: action,
      deleteIssuePropertyOption: action,
    });
    this.rootStore = rootStore;
    this.issueTypeService = new IssueTypeService();
  }

  // ------------------------------------------------------------- helpers
  // NOTE: computedFn memoizes by argument count, so every helper takes an explicit
  // `activeOnly` flag and callers must always pass it.

  isProjectFetched = computedFn((projectId: string | null | undefined) => !!projectId && !!this.fetchedMap[projectId]);

  getProjectIssueTypes = computedFn((projectId: string | null | undefined, activeOnly: boolean) => {
    if (!projectId) return [];
    const types = Object.values(this.issueTypeMap).filter(
      (issueType) => issueType.project_ids?.includes(projectId) && (!activeOnly || issueType.is_active)
    );
    return sortBy(types, [(type) => (type.is_default ? 0 : 1), "level", "created_at"]);
  });

  getProjectIssueTypeIds = computedFn((projectId: string | null | undefined, activeOnly: boolean) =>
    this.getProjectIssueTypes(projectId, activeOnly).map((issueType) => issueType.id)
  );

  getIssueTypeById = computedFn((issueTypeId: string | null | undefined) =>
    issueTypeId ? this.issueTypeMap[issueTypeId] : undefined
  );

  getProjectDefaultIssueTypeId = computedFn((projectId: string | null | undefined) => {
    const defaultType = this.getProjectIssueTypes(projectId, false).find((issueType) => issueType.is_default);
    return defaultType?.id ?? null;
  });

  getPropertiesByIssueTypeId = computedFn((issueTypeId: string | null | undefined, activeOnly: boolean) => {
    if (!issueTypeId) return [];
    const properties = Object.values(this.propertyMap).filter(
      (property) => property.issue_type === issueTypeId && (!activeOnly || property.is_active)
    );
    return sortBy(properties, ["sort_order", "created_at"]);
  });

  getPropertyById = computedFn((propertyId: string | null | undefined) =>
    propertyId ? this.propertyMap[propertyId] : undefined
  );

  // --------------------------------------------------------------- fetch

  fetchProjectIssueTypes = async (workspaceSlug: string, projectId: string, force = false) => {
    if (!force && (this.fetchedMap[projectId] || this.loaderMap[projectId])) return;
    runInAction(() => {
      set(this.loaderMap, projectId, true);
    });
    try {
      const [types, properties] = await Promise.all([
        this.issueTypeService.fetchIssueTypes(workspaceSlug, projectId),
        this.issueTypeService.fetchIssueProperties(workspaceSlug, projectId),
      ]);
      runInAction(() => {
        // drop stale entries for this project before re-adding
        Object.values(this.issueTypeMap).forEach((issueType) => {
          if (issueType.project_ids?.includes(projectId)) unset(this.issueTypeMap, issueType.id);
        });
        Object.values(this.propertyMap).forEach((property) => {
          if (property.project === projectId) unset(this.propertyMap, property.id);
        });
        types.forEach((issueType) => set(this.issueTypeMap, issueType.id, issueType));
        properties.forEach((property) => set(this.propertyMap, property.id, property));
        set(this.fetchedMap, projectId, true);
      });
    } finally {
      runInAction(() => {
        set(this.loaderMap, projectId, false);
      });
    }
  };

  // ----------------------------------------------------------- type crud

  createIssueType = async (workspaceSlug: string, projectId: string, data: Partial<TIssueType>) => {
    const issueType = await this.issueTypeService.createIssueType(workspaceSlug, projectId, data);
    // creating the first type seeds the default type server side, so refresh the project
    await this.fetchProjectIssueTypes(workspaceSlug, projectId, true);
    return this.issueTypeMap[issueType.id] ?? issueType;
  };

  updateIssueType = async (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: Partial<TIssueType>
  ) => {
    const issueType = await this.issueTypeService.updateIssueType(workspaceSlug, projectId, issueTypeId, data);
    runInAction(() => {
      if (issueType.is_default) {
        this.getProjectIssueTypes(projectId, false).forEach((type) => {
          if (type.id !== issueType.id) set(this.issueTypeMap, [type.id, "is_default"], false);
        });
      }
      set(this.issueTypeMap, issueType.id, issueType);
    });
    return issueType;
  };

  deleteIssueType = async (workspaceSlug: string, projectId: string, issueTypeId: string) => {
    await this.issueTypeService.deleteIssueType(workspaceSlug, projectId, issueTypeId);
    runInAction(() => {
      unset(this.issueTypeMap, issueTypeId);
      Object.values(this.propertyMap).forEach((property) => {
        if (property.issue_type === issueTypeId) unset(this.propertyMap, property.id);
      });
    });
  };

  // ------------------------------------------------------- property crud

  createIssueProperty = async (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssuePropertyPayload
  ) => {
    const property = await this.issueTypeService.createIssueProperty(workspaceSlug, projectId, issueTypeId, data);
    runInAction(() => {
      set(this.propertyMap, property.id, property);
    });
    return property;
  };

  updateIssueProperty = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: TIssuePropertyPayload
  ) => {
    const property = await this.issueTypeService.updateIssueProperty(workspaceSlug, projectId, propertyId, data);
    runInAction(() => {
      set(this.propertyMap, property.id, property);
    });
    return property;
  };

  deleteIssueProperty = async (workspaceSlug: string, projectId: string, propertyId: string) => {
    await this.issueTypeService.deleteIssueProperty(workspaceSlug, projectId, propertyId);
    runInAction(() => {
      unset(this.propertyMap, propertyId);
    });
  };

  // --------------------------------------------------------- option crud

  private replaceOptions(propertyId: string, updater: (options: TIssuePropertyOption[]) => TIssuePropertyOption[]) {
    const property = this.propertyMap[propertyId];
    if (!property) return;
    const options = sortBy(updater([...(property.options ?? [])]), ["sort_order"]);
    set(this.propertyMap, [propertyId, "options"], options);
  }

  createIssuePropertyOption = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    data: Partial<TIssuePropertyOption>
  ) => {
    const option = await this.issueTypeService.createIssuePropertyOption(workspaceSlug, projectId, propertyId, data);
    runInAction(() => {
      this.replaceOptions(propertyId, (options) => {
        const isSingle = !this.propertyMap[propertyId]?.is_multi;
        const next = option.is_default && isSingle ? options.map((o) => ({ ...o, is_default: false })) : options;
        return [...next, option];
      });
    });
    return option;
  };

  updateIssuePropertyOption = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string,
    data: Partial<TIssuePropertyOption>
  ) => {
    const option = await this.issueTypeService.updateIssuePropertyOption(
      workspaceSlug,
      projectId,
      propertyId,
      optionId,
      data
    );
    runInAction(() => {
      this.replaceOptions(propertyId, (options) => {
        const isSingle = !this.propertyMap[propertyId]?.is_multi;
        return options.map((o) => {
          if (o.id === option.id) return option;
          return option.is_default && isSingle ? { ...o, is_default: false } : o;
        });
      });
    });
    return option;
  };

  deleteIssuePropertyOption = async (
    workspaceSlug: string,
    projectId: string,
    propertyId: string,
    optionId: string
  ) => {
    await this.issueTypeService.deleteIssuePropertyOption(workspaceSlug, projectId, propertyId, optionId);
    runInAction(() => {
      this.replaceOptions(propertyId, (options) => options.filter((o) => o.id !== optionId));
    });
  };
}
