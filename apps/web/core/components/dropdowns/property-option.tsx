/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
import { ListChecks } from "lucide-react";
// plane imports
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@plane/propel/icons";
import type { TIssueProperty } from "@plane/types";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useDropdown } from "@/hooks/use-dropdown";
// local imports
import { DropdownButton } from "./buttons";
import { BUTTON_VARIANTS_WITH_TEXT } from "./constants";
import type { TDropdownProps } from "./types";

type Props = TDropdownProps & {
  property: TIssueProperty;
  value: string[];
  onChange: (optionIds: string[]) => void;
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  onClose?: () => void;
  renderByDefault?: boolean;
};

/**
 * Picker for OPTION typed custom properties. Single or multi select depending on
 * `property.is_multi`. Built on the same popper/combobox pattern as the other
 * property dropdowns so it positions correctly inside modals and the sidebar.
 */
export const PropertyOptionDropdown = observer(function PropertyOptionDropdown(props: Props) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    hideIcon = false,
    onChange,
    onClose,
    placeholder,
    placement,
    property,
    showTooltip = false,
    tabIndex,
    value,
    renderByDefault = true,
  } = props;
  const isMulti = property.is_multi;
  // states
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });
  // derived values
  const options = (property.options ?? [])
    .filter((option) => option.is_active || value.includes(option.id))
    .map((option) => ({ value: option.id, query: option.name, content: option.name }));
  const filteredOptions =
    query === "" ? options : options.filter((option) => option.query.toLowerCase().includes(query.toLowerCase()));
  const selectedNames = value
    .map((id) => property.options?.find((option) => option.id === id)?.name)
    .filter(Boolean) as string[];
  const buttonText =
    selectedNames.length > 0
      ? selectedNames.join(", ")
      : (placeholder ?? (isMulti ? "Select options" : "Select option"));

  const { handleClose, handleKeyDown, handleOnClick, searchInputKeyDown } = useDropdown({
    dropdownRef,
    inputRef,
    isOpen,
    onClose,
    query,
    setIsOpen,
    setQuery,
  });

  const dropdownOnChange = (val: string | string[] | null) => {
    if (isMulti) {
      onChange(Array.isArray(val) ? val : []);
      return;
    }
    onChange(val && !Array.isArray(val) ? [val] : []);
    handleClose();
  };

  const comboButton = button ? (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn("clickable block h-full w-full outline-none", buttonContainerClassName)}
      onClick={handleOnClick}
      disabled={disabled}
    >
      {button}
    </button>
  ) : (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none",
        { "cursor-not-allowed text-secondary": disabled, "cursor-pointer": !disabled },
        buttonContainerClassName
      )}
      onClick={handleOnClick}
      disabled={disabled}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading={property.display_name}
        tooltipContent={buttonText}
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {!hideIcon && <ListChecks className="h-3 w-3 flex-shrink-0" />}
        {BUTTON_VARIANTS_WITH_TEXT.includes(buttonVariant) && (
          <span className={cn("truncate", selectedNames.length === 0 && "text-placeholder")}>{buttonText}</span>
        )}
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </DropdownButton>
    </button>
  );

  const comboboxValue = isMulti ? value : (value[0] ?? null);

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      tabIndex={tabIndex}
      className={cn("h-full w-full", className)}
      value={comboboxValue}
      onChange={dropdownOnChange}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
      {...(isMulti ? { multiple: true } : {})}
    >
      {isOpen && (
        <Combobox.Options as="ul" className="fixed z-10" static>
          <div
            className="my-1 w-52 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" />
              <Combobox.Input
                as="input"
                ref={inputRef}
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                displayValue={() => ""}
                onKeyDown={searchInputKeyDown}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
              {!isMulti && !property.is_required && value.length > 0 && (
                <Combobox.Option as="li" value={null}>
                  {({ active }) => (
                    <div
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 truncate rounded-sm px-1 py-1.5 text-secondary select-none",
                        { "bg-layer-transparent-hover": active }
                      )}
                    >
                      <span className="flex-grow truncate">None</span>
                    </div>
                  )}
                </Combobox.Option>
              )}
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <Combobox.Option as="li" key={option.value} value={option.value}>
                    {({ active, selected }) => (
                      <div
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                          {
                            "bg-layer-transparent-hover": active,
                            "text-primary": selected,
                            "text-secondary": !selected,
                          }
                        )}
                      >
                        <span className="flex-grow truncate">{option.content}</span>
                        {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                      </div>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-1.5 py-1 text-placeholder italic">No matching results</p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </ComboDropDown>
  );
});
