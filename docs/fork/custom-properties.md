# Work item types and custom properties (fork feature)

This fork adds project-level work item types with custom properties to the community edition.
Upstream keeps this feature commercial-only (see makeplane/plane#8467), so nothing here is
meant to be upstreamed. The design mirrors the commercial API shape where it is public so that
importers, automations and docs written for Plane Pro translate with minimal changes.

## Scope decisions

- **Project-level types.** A type belongs to exactly one project (`IssueType` + one
  `ProjectIssueType` row). Workspace-level types and "contexts" were deliberately left out;
  ids are stable so a later roll-up would not touch stored values.
- **Enable once.** Turning on `is_issue_type_enabled` seeds a default `Task` type and assigns
  it to every work item without a type. Creating the first type also enables the feature.
  The feature cannot be turned off.
- **One default type per project.** The default cannot be deactivated or deleted. Deleting a
  non-default type moves its work items to the default type; their property values for the
  deleted type are soft-deleted with the type.
- **Values are typed, one row per value.** Multi-value properties store one row per value.
  This keeps filtering, ordering and grouping possible with plain SQL later.

## Data model (`apps/api/plane/db/models/issue_property.py`)

| Model                 | Purpose                       | Notable fields                                                                                                                                                                                                                |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IssueProperty`       | Property definition on a type | `property_type` (TEXT, DATETIME, DECIMAL, BOOLEAN, OPTION, RELATION, URL, EMAIL), `relation_type` (ISSUE, USER), `is_required`, `is_multi`, `is_active`, `default_value` (list), `settings`, `validation_rules`, `sort_order` |
| `IssuePropertyOption` | Dropdown option               | `name`, `is_default`, `is_active`, `sort_order`, `logo_props`                                                                                                                                                                 |
| `IssuePropertyValue`  | One value on one work item    | `value_text`, `value_decimal`, `value_datetime`, `value_boolean`, `value_uuid`, `value_option`                                                                                                                                |

Rules enforced by the serializers: the type and relation type of a property never change after
creation; a multi-value property cannot become single-valued; only OPTION and RELATION may be
multi-valued; BOOLEAN and read-only TEXT cannot be mandatory.

`settings.display_format` holds `single-line | multi-line | read-only` for TEXT and one of
`MMM dd, yyyy | dd/MM/yyyy | MM/dd/yyyy | yyyy/MM/dd` for DATETIME. `validation_rules` holds
`min`/`max` for DECIMAL and `max_length` for TEXT.

## Wire format for values

The app API always exchanges a **list** of values per property, keyed by property id. An empty
list clears the property.

| Type             | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| TEXT, URL, EMAIL | string                                                      |
| DECIMAL          | number                                                      |
| DATETIME         | ISO 8601 date or datetime string                            |
| BOOLEAN          | boolean                                                     |
| OPTION           | option id                                                   |
| RELATION         | user id (USER) or work item id (ISSUE), both project-scoped |

## App API (session auth, under `/api/workspaces/<slug>/projects/<project_id>/`)

| Method             | Path                                           | Role                                                                                                                                 |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET, POST          | `issue-types/`                                 | all members read; admin writes                                                                                                       |
| GET, PATCH, DELETE | `issue-types/<id>/`                            | admin writes                                                                                                                         |
| GET                | `issue-properties/`                            | all properties of the project                                                                                                        |
| GET, POST          | `issue-types/<type_id>/issue-properties/`      | POST may include inline `options` for dropdowns (max 100)                                                                            |
| GET, PATCH, DELETE | `issue-properties/<id>/`                       |                                                                                                                                      |
| GET, POST          | `issue-properties/<property_id>/options/`      |                                                                                                                                      |
| PATCH, DELETE      | `issue-properties/<property_id>/options/<id>/` |                                                                                                                                      |
| GET, POST          | `issues/<issue_id>/issue-property-values/`     | POST body `{"property_values": {<property_id>: value or [values]}}`; replaces only the listed properties; members write, guests read |
| POST               | `issue-property-values/batch/`                 | body `{"issue_ids": [...]}` (max 500) → `{issue_id: {property_id: [values]}}`                                                        |

`type_id` is accepted on work item create and update and must belong to the project. Work
items created without a type get the project default. Every issue payload now carries `type_id`.

Value changes are recorded as `IssueActivity` rows with `field="issue_property"`, the property
id in `new_identifier`, human-readable old and new values, and a fallback sentence in `comment`.

## Frontend

- Store: `apps/web/core/store/issue-type.store.ts` (types, properties, options per project) and
  `apps/web/core/store/issue/issue-details/property-value.store.ts` (values per work item),
  hook `useIssueTypes`, service `apps/web/core/services/issue-type/issue-type.service.ts`.
- Settings page: Project settings → Features → Work item types
  (`apps/web/core/components/issue-types/settings/`).
- Create/update modal: type selector in the header, custom property inputs above the default
  property chips; the previously stubbed `IssueModalProvider` context now validates mandatory
  properties and saves values after the work item is saved.
- Detail sidebar and peek overview: `IssueCustomPropertiesSidebar` renders one row per active
  property of the work item's type; edits save on blur/select.
- Type switcher next to the identifier; activity renderer `actions/issue-property.tsx`.
- Shared editor `components/issue-types/values/property-value-input.tsx` handles every type.

## Known limits and next phases

1. Required properties are enforced by the create modal and when a value is explicitly
   cleared; the API does not yet block creating a work item that lacks a required value.
2. Work item relations (RELATION/ISSUE) are stored and validated by the API but the UI has no
   picker yet.
3. Layouts: custom properties are not yet spreadsheet columns, display properties, filters,
   group-by or order-by options. This needs the closed `IIssueDisplayProperties` and
   `WORK_ITEM_FILTER_PROPERTY_KEYS` types opened to dynamic `custom_<id>` keys, dynamic
   `IssueFilterSet` entries and grouper support on the backend.
4. Public API v1 (API-key auth) parity with the commercial `work-item-types` /
   `work-item-properties` / `values` endpoints, plus a type schema endpoint.
5. Bulk edit, CSV export, webhooks payloads, drafts and intake.

## Local development

See `dev/README.md`. The whole backend runs from `dev/dc.sh up -d --build`; the web app runs
on the host with `pnpm dev` and is served through the proxy at http://localhost:8085.
