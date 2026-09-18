/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Switch } from "@makeplane/propel/components/switch";
import { Plus, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { EIssuePropertyRelationType, EIssuePropertyType } from "@plane/types";
import type {
  TIssueProperty,
  TIssuePropertyDateFormat,
  TIssuePropertyOption,
  TIssuePropertyPayload,
  TIssuePropertyTextFormat,
  TIssuePropertyValue,
} from "@plane/types";
import { CustomSelect, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import {
  ISSUE_PROPERTY_DATE_FORMATS,
  ISSUE_PROPERTY_TYPE_LABELS,
  ISSUE_PROPERTY_TYPE_OPTIONS,
  isMultiCapable,
} from "../helpers";
import { IssuePropertyTypeIcon } from "../property-icon";
import { PropertyValueInput } from "../values/property-value-input";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  isOpen: boolean;
  onClose: () => void;
  /** When set, the modal edits this property; otherwise it creates one. */
  property?: TIssueProperty;
};

type TOptionDraft = { key: string; id?: string; name: string; is_default: boolean; is_active: boolean };

let optionKeyCounter = 0;
const newOptionDraft = (): TOptionDraft => ({
  key: `new-${++optionKeyCounter}`,
  name: "",
  is_default: false,
  is_active: true,
});

type TFormState = {
  display_name: string;
  description: string;
  property_type: EIssuePropertyType;
  is_multi: boolean;
  is_required: boolean;
  is_active: boolean;
  text_format: TIssuePropertyTextFormat;
  date_format: TIssuePropertyDateFormat;
  min: string;
  max: string;
  default_value: TIssuePropertyValue[];
  options: TOptionDraft[];
};

const TEXT_FORMATS: { value: TIssuePropertyTextFormat; label: string }[] = [
  { value: "single-line", label: "Single line" },
  { value: "multi-line", label: "Paragraph" },
  { value: "read-only", label: "Read only" },
];

const emptyForm = (): TFormState => ({
  display_name: "",
  description: "",
  property_type: EIssuePropertyType.TEXT,
  is_multi: false,
  is_required: false,
  is_active: true,
  text_format: "single-line",
  date_format: "MMM dd, yyyy",
  min: "",
  max: "",
  default_value: [],
  options: [newOptionDraft()],
});

const formFromProperty = (property: TIssueProperty): TFormState => ({
  display_name: property.display_name,
  description: property.description ?? "",
  property_type: property.property_type,
  is_multi: property.is_multi,
  is_required: property.is_required,
  is_active: property.is_active,
  text_format: (property.settings?.display_format as TIssuePropertyTextFormat) ?? "single-line",
  date_format: (property.settings?.display_format as TIssuePropertyDateFormat) ?? "MMM dd, yyyy",
  min: property.validation_rules?.min !== undefined ? String(property.validation_rules.min) : "",
  max: property.validation_rules?.max !== undefined ? String(property.validation_rules.max) : "",
  default_value: [...(property.default_value ?? [])],
  options: (property.options ?? []).map((option) => ({
    key: option.id,
    id: option.id,
    name: option.name,
    is_default: option.is_default,
    is_active: option.is_active,
  })),
});

/** Create or update a custom property, including inline dropdown options. */
export const IssuePropertyModal = observer(function IssuePropertyModal(props: Props) {
  const { workspaceSlug, projectId, issueTypeId, isOpen, onClose, property } = props;
  // store hooks
  const {
    createIssueProperty,
    updateIssueProperty,
    createIssuePropertyOption,
    updateIssuePropertyOption,
    deleteIssuePropertyOption,
  } = useIssueTypes();
  // states
  const [form, setForm] = useState<TFormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!property;

  useEffect(() => {
    if (!isOpen) return;
    setForm(property ? formFromProperty(property) : emptyForm());
    setErrors({});
  }, [isOpen, property]);

  const update = <K extends keyof TFormState>(key: K, value: TFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isOption = form.property_type === EIssuePropertyType.OPTION;
  const isRelation = form.property_type === EIssuePropertyType.RELATION;
  const isBoolean = form.property_type === EIssuePropertyType.BOOLEAN;
  const canBeRequired =
    !isBoolean && !(form.property_type === EIssuePropertyType.TEXT && form.text_format === "read-only");
  const supportsDefault = [
    EIssuePropertyType.TEXT,
    EIssuePropertyType.DECIMAL,
    EIssuePropertyType.BOOLEAN,
    EIssuePropertyType.DATETIME,
    EIssuePropertyType.URL,
    EIssuePropertyType.EMAIL,
  ].includes(form.property_type);

  // a transient property used to render the default value editor
  const previewProperty = useMemo<TIssueProperty>(
    () => ({
      id: property?.id ?? "preview",
      issue_type: issueTypeId,
      display_name: form.display_name || "Default value",
      description: "",
      property_type: form.property_type,
      relation_type: isRelation ? EIssuePropertyRelationType.USER : null,
      is_required: false,
      is_active: true,
      is_multi: form.is_multi,
      default_value: [],
      settings: {
        display_format:
          form.property_type === EIssuePropertyType.TEXT
            ? form.text_format === "read-only"
              ? "single-line"
              : form.text_format
            : form.property_type === EIssuePropertyType.DATETIME
              ? form.date_format
              : undefined,
      },
      validation_rules: {
        min: form.min !== "" ? Number(form.min) : undefined,
        max: form.max !== "" ? Number(form.max) : undefined,
      },
      logo_props: {},
      sort_order: 0,
      options: [],
      project: projectId,
      workspace: "",
    }),
    [property?.id, issueTypeId, form, isRelation, projectId]
  );

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.display_name.trim()) next.display_name = "You must name your property.";
    if (form.display_name.trim().length > 255) next.display_name = "Property name should not exceed 255 characters.";
    if (isOption) {
      const names = form.options.map((option) => option.name.trim()).filter(Boolean);
      if (names.length === 0) next.options = "You must add at least one option.";
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
        next.options = "Option names must be unique.";
    }
    if (form.property_type === EIssuePropertyType.DECIMAL && form.min !== "" && form.max !== "") {
      if (Number(form.min) > Number(form.max)) next.min = "Minimum must not exceed maximum.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): TIssuePropertyPayload => {
    const payload: TIssuePropertyPayload = {
      display_name: form.display_name.trim(),
      description: form.description.trim(),
      is_required: canBeRequired ? form.is_required : false,
      is_active: form.is_active,
      is_multi: isMultiCapable(form.property_type) ? form.is_multi : false,
      settings: {},
      validation_rules: {},
      default_value: supportsDefault ? form.default_value : [],
    };
    if (!isEdit) {
      payload.property_type = form.property_type;
      payload.relation_type = isRelation ? EIssuePropertyRelationType.USER : null;
    }
    if (form.property_type === EIssuePropertyType.TEXT) payload.settings = { display_format: form.text_format };
    if (form.property_type === EIssuePropertyType.DATETIME) payload.settings = { display_format: form.date_format };
    if (form.property_type === EIssuePropertyType.DECIMAL) {
      payload.validation_rules = {
        ...(form.min !== "" ? { min: Number(form.min) } : {}),
        ...(form.max !== "" ? { max: Number(form.max) } : {}),
      };
    }
    if (isOption && !isEdit) {
      payload.options = form.options
        .filter((option) => option.name.trim())
        .map((option) => ({ name: option.name.trim(), is_default: option.is_default }));
    }
    return payload;
  };

  const syncOptions = async (propertyId: string, existing: TIssuePropertyOption[]) => {
    const drafts = form.options.filter((option) => option.name.trim() || option.id);
    const keptIds = new Set(drafts.map((option) => option.id).filter(Boolean));
    await Promise.all(
      existing
        .filter((option) => !keptIds.has(option.id))
        .map((option) => deleteIssuePropertyOption(workspaceSlug, projectId, propertyId, option.id))
    );
    // create/update sequentially so server side sort order follows the list order
    await drafts.reduce<Promise<unknown>>((chain, draft) => {
      const name = draft.name.trim();
      if (!name) return chain;
      const payload = { name, is_default: draft.is_default, is_active: draft.is_active };
      if (draft.id) {
        const original = existing.find((option) => option.id === draft.id);
        const changed =
          original &&
          (original.name !== name ||
            original.is_default !== draft.is_default ||
            original.is_active !== draft.is_active);
        if (!changed) return chain;
        const optionId = draft.id;
        return chain.then(() => updateIssuePropertyOption(workspaceSlug, projectId, propertyId, optionId, payload));
      }
      return chain.then(() => createIssuePropertyOption(workspaceSlug, projectId, propertyId, payload));
    }, Promise.resolve());
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      if (isEdit && property) {
        await updateIssueProperty(workspaceSlug, projectId, property.id, buildPayload());
        if (isOption) await syncOptions(property.id, property.options ?? []);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: `Property ${form.display_name} updated.` });
      } else {
        await createIssueProperty(workspaceSlug, projectId, issueTypeId, buildPayload());
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: `Property ${form.display_name} created.` });
      }
      onClose();
    } catch (error: unknown) {
      const data = (error ?? {}) as Record<string, unknown>;
      const firstError = Object.values(data).flat()[0];
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: typeof firstError === "string" ? firstError : "Failed to save the property. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const setOption = (index: number, patch: Partial<TOptionDraft>) =>
    update(
      "options",
      form.options.map((option, i) => {
        if (i !== index) return form.is_multi || !patch.is_default ? option : { ...option, is_default: false };
        return { ...option, ...patch };
      })
    );

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} width={EModalWidth.XXL}>
      <div className="flex max-h-[85vh] flex-col">
        <div className="space-y-4 overflow-y-auto p-5">
          <h3 className="text-h4-medium text-secondary">
            {isEdit ? "Update custom property" : "Create new custom property"}
          </h3>

          {/* type picker */}
          <div className="space-y-1.5">
            <div id="property-type-label" className="text-body-xs-medium text-secondary">
              Property type
            </div>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              role="radiogroup"
              aria-labelledby="property-type-label"
            >
              {ISSUE_PROPERTY_TYPE_OPTIONS.map((type) => {
                const selected = form.property_type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={isEdit}
                    onClick={() => {
                      if (type === form.property_type) return;
                      setForm((prev) => ({
                        ...prev,
                        property_type: type,
                        is_multi: false,
                        is_required: false,
                        default_value: [],
                      }));
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-md border-[0.5px] px-2.5 py-2 text-left text-body-xs-regular transition-colors",
                      selected
                        ? "border-accent-strong bg-accent-primary/10 text-primary"
                        : "border-strong text-secondary hover:bg-layer-transparent-hover",
                      isEdit && !selected && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <IssuePropertyTypeIcon propertyType={type} className="size-4" />
                    <span className="truncate">{ISSUE_PROPERTY_TYPE_LABELS[type]}</span>
                  </button>
                );
              })}
            </div>
            {isEdit && (
              <p className="text-caption-sm-regular text-tertiary">
                The type of a property cannot be changed after creation.
              </p>
            )}
          </div>

          {/* name / description */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-body-xs-medium text-secondary" htmlFor="property-title">
                Title
              </label>
              <Input
                id="property-title"
                value={form.display_name}
                onChange={(e) => update("display_name", e.target.value)}
                placeholder="Title"
                hasError={!!errors.display_name}
                className="w-full"
              />
              {errors.display_name && (
                <p className="text-caption-sm-regular text-danger-primary">{errors.display_name}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-body-xs-medium text-secondary" htmlFor="property-description">
                Description
              </label>
              <TextArea
                id="property-description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Description"
                className="w-full resize-none"
                textAreaSize="sm"
              />
            </div>
          </div>

          {/* type specific attributes */}
          <div className="space-y-3 rounded-md border-[0.5px] border-subtle p-3">
            <div className="text-body-xs-medium text-secondary">Attributes</div>

            {form.property_type === EIssuePropertyType.TEXT && (
              <AttributeRow label="Text format">
                <SegmentedChoice
                  value={form.text_format}
                  options={TEXT_FORMATS}
                  onChange={(value) => {
                    update("text_format", value);
                    if (value === "read-only") update("is_required", false);
                  }}
                />
              </AttributeRow>
            )}

            {form.property_type === EIssuePropertyType.DATETIME && (
              <AttributeRow label="Date format">
                <CustomSelect
                  value={form.date_format}
                  onChange={(value: TIssuePropertyDateFormat) => update("date_format", value)}
                  label={<span className="text-body-xs-regular">{form.date_format}</span>}
                  buttonClassName="h-7 border-[0.5px] border-strong"
                  maxHeight="md"
                >
                  {ISSUE_PROPERTY_DATE_FORMATS.map((format) => (
                    <CustomSelect.Option key={format} value={format}>
                      {format}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </AttributeRow>
            )}

            {form.property_type === EIssuePropertyType.DECIMAL && (
              <AttributeRow label="Range">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={form.min}
                    onChange={(e) => update("min", e.target.value)}
                    placeholder="Min"
                    inputSize="xs"
                    className="w-24"
                    hasError={!!errors.min}
                  />
                  <span className="text-caption-sm-regular text-tertiary">to</span>
                  <Input
                    type="number"
                    value={form.max}
                    onChange={(e) => update("max", e.target.value)}
                    placeholder="Max"
                    inputSize="xs"
                    className="w-24"
                  />
                </div>
                {errors.min && <p className="text-caption-sm-regular text-danger-primary">{errors.min}</p>}
              </AttributeRow>
            )}

            {isMultiCapable(form.property_type) && (
              <AttributeRow label={isOption ? "Selection" : "Members"}>
                <SegmentedChoice
                  value={form.is_multi ? "multi" : "single"}
                  options={[
                    { value: "single", label: "Single select" },
                    { value: "multi", label: "Multi select" },
                  ]}
                  onChange={(value) => {
                    if (isEdit && property?.is_multi && value === "single") return;
                    update("is_multi", value === "multi");
                    if (value === "single") {
                      let seen = false;
                      update(
                        "options",
                        form.options.map((option) => {
                          if (option.is_default && !seen) {
                            seen = true;
                            return option;
                          }
                          return { ...option, is_default: false };
                        })
                      );
                    }
                  }}
                />
              </AttributeRow>
            )}

            {isOption && (
              <AttributeRow label="Options">
                <div className="space-y-1.5">
                  {form.options.map((option, index) => (
                    <div key={option.key} className="flex items-center gap-2">
                      <Input
                        value={option.name}
                        onChange={(e) => setOption(index, { name: e.target.value })}
                        placeholder="Add option"
                        inputSize="xs"
                        className="grow"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            update("options", [...form.options, newOptionDraft()]);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setOption(index, { is_default: !option.is_default })}
                        className={cn(
                          "shrink-0 rounded-sm px-1.5 py-0.5 text-caption-sm-regular",
                          option.is_default
                            ? "bg-accent-primary/15 text-accent-primary"
                            : "text-tertiary hover:bg-layer-transparent-hover"
                        )}
                      >
                        {option.is_default ? "Default" : "Set default"}
                      </button>
                      {isEdit && option.id && (
                        <Switch
                          size="sm"
                          checked={option.is_active}
                          onCheckedChange={(checked: boolean) => setOption(index, { is_active: checked })}
                          aria-label="Option active"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "options",
                            form.options.filter((_, i) => i !== index)
                          )
                        }
                        className="shrink-0 rounded-sm p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-danger-primary"
                        aria-label="Remove option"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="link"
                    size="sm"
                    prependIcon={<Plus className="size-3.5" />}
                    onClick={() => update("options", [...form.options, newOptionDraft()])}
                  >
                    Add option
                  </Button>
                  {errors.options && <p className="text-caption-sm-regular text-danger-primary">{errors.options}</p>}
                </div>
              </AttributeRow>
            )}

            {supportsDefault && (
              <AttributeRow label="Default value">
                <PropertyValueInput
                  property={previewProperty}
                  value={form.default_value}
                  onChange={(value) => update("default_value", value)}
                  projectId={projectId}
                  variant="modal"
                />
              </AttributeRow>
            )}

            <AttributeRow label="Mandatory property">
              <div className="flex items-center gap-2">
                <Switch
                  size="sm"
                  checked={canBeRequired && form.is_required}
                  onCheckedChange={(checked: boolean) => update("is_required", checked)}
                  disabled={!canBeRequired}
                  aria-label="Mandatory property"
                />
                <span className="text-caption-sm-regular text-tertiary">
                  {canBeRequired
                    ? "Users must fill this property before creating a work item."
                    : "This property type cannot be made mandatory."}
                </span>
              </div>
            </AttributeRow>

            {isEdit && (
              <AttributeRow label="Active">
                <div className="flex items-center gap-2">
                  <Switch
                    size="sm"
                    checked={form.is_active}
                    onCheckedChange={(checked: boolean) => update("is_active", checked)}
                    aria-label="Active"
                  />
                  <span className="text-caption-sm-regular text-tertiary">
                    Inactive properties are hidden everywhere but keep their values.
                  </span>
                </div>
              </AttributeRow>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleSubmit()} loading={isSubmitting}>
            {isSubmitting ? "Saving" : isEdit ? "Update property" : "Create property"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});

function AttributeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[9rem_1fr] sm:items-start sm:gap-3">
      <div className="pt-1 text-body-xs-regular text-tertiary">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border-[0.5px] border-strong p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-sm px-2 py-0.5 text-caption-sm-regular",
            value === option.value ? "bg-layer-transparent-active text-primary" : "text-tertiary hover:text-secondary"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
