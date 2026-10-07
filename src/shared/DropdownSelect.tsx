import { useEffect, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownSelectProps {
  id?: string;
  ariaLabel: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}

// A single shared replacement for native <select> elements, styled like the
// branch picker menu. Keyboard: Enter/Space/ArrowDown opens, arrows move the
// active option, Enter selects, Escape closes, Home/End jump; clicking
// outside closes.
export function DropdownSelect({
  id,
  ariaLabel,
  value,
  options,
  onChange,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `${id ?? "dropdown-select"}-menu`;

  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? value;

  const close = (refocusTrigger = true) => {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  };

  const select = (option: DropdownOption) => {
    onChange(option.value);
    close();
  };

  const openMenu = () => {
    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Focus the active option whenever the menu opens or the highlight moves.
  useEffect(() => {
    if (!open) return;
    const menu = document.getElementById(menuId);
    const buttons =
      menu?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    buttons?.[activeIndex]?.focus();
  }, [open, activeIndex, menuId]);

  const moveActive = (offset: number) => {
    setActiveIndex((current) => {
      if (options.length === 0) return current;
      return (current + offset + options.length) % options.length;
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(Math.max(0, options.length - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (options[activeIndex]) select(options[activeIndex]);
        break;
      default:
        break;
    }
  };

  return (
    <div className="dropdown-select" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="dropdown-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openMenu())}
      >
        <span className="dropdown-select-value">{selectedLabel}</span>
        <span className="dropdown-select-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="dropdown-select-menu"
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`dropdown-select-option${
                option.value === value ? " is-selected" : ""
              }`}
              onClick={() => select(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Editable combobox variant: free-form text input with a custom suggestion
// menu replacing the native <datalist> dropdown. Typing filters the options;
// picking one (mouse or keyboard) fills the input, which stays editable.
export interface ComboboxInputProps {
  id?: string;
  ariaLabel: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ComboboxInput({
  id,
  ariaLabel,
  value,
  options,
  onChange,
  placeholder,
}: ComboboxInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuId = `${id ?? "dropdown-combobox"}-menu`;

  const query = value.trim().toLowerCase();
  const suggestions = query
    ? options.filter((option) => option.toLowerCase().includes(query))
    : options;
  const activeIndexSafe = Math.min(
    activeIndex,
    Math.max(0, suggestions.length - 1),
  );

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className="dropdown-select"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            setActiveIndex(0);
          } else {
            setActiveIndex((current) =>
              Math.min(current + 1, suggestions.length - 1),
            );
          }
        } else if (event.key === "ArrowUp" && open) {
          event.preventDefault();
          setActiveIndex((current) => Math.max(0, current - 1));
        } else if (event.key === "Enter") {
          const active = suggestions[activeIndexSafe];
          if (open && active) {
            event.preventDefault();
            pick(active);
          }
        } else if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
        }
      }}
    >
      <div className="dropdown-select-input-wrap">
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          className="dropdown-select-input form-control"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open && suggestions[activeIndexSafe]
              ? `${menuId}-option-${activeIndexSafe}`
              : undefined
          }
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="dropdown-select-caret-button"
          aria-hidden="true"
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <span className="dropdown-select-caret" aria-hidden="true" />
        </button>
      </div>
      {open && suggestions.length ? (
        <div
          className="dropdown-select-menu"
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
        >
          {suggestions.map((option, index) => (
            <button
              key={option}
              type="button"
              role="option"
              id={`${menuId}-option-${index}`}
              aria-selected={option === value}
              className={`dropdown-select-option${
                index === activeIndexSafe ? " is-active" : ""
              }`}
              onClick={() => pick(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
