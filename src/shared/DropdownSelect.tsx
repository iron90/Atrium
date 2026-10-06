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
    const buttons = menu?.querySelectorAll<HTMLButtonElement>('[role="option"]');
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
