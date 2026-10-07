import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboboxInput, DropdownSelect } from "./DropdownSelect";

afterEach(cleanup);

describe("DropdownSelect", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("opens the menu and selects an option by click", () => {
    const onChange = vi.fn();
    render(
      <DropdownSelect
        ariaLabel="pick"
        value="a"
        options={options}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));

    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects with the keyboard and closes on escape", () => {
    const onChange = vi.fn();
    render(
      <DropdownSelect
        ariaLabel="pick"
        value="a"
        options={options}
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "pick" }), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(screen.getByRole("option", { name: "Alpha" }), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(screen.getByRole("option", { name: "Beta" }), {
      key: "Enter",
    });

    expect(onChange).toHaveBeenCalledWith("b");

    fireEvent.keyDown(screen.getByRole("button", { name: "pick" }), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(screen.getByRole("option", { name: "Alpha" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when the pointer goes down outside", () => {
    render(
      <DropdownSelect
        ariaLabel="pick"
        value="a"
        options={options}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("ComboboxInput", () => {
  const options = ["main", "HEAD", "v0.2.0"];

  // The combobox is controlled; the harness keeps the value in state the way
  // the git history panel does.
  function ComboboxHarness({
    onChange,
  }: {
    onChange: (value: string) => void;
  }) {
    const [value, setValue] = useState("");
    return (
      <ComboboxInput
        ariaLabel="revision"
        value={value}
        options={options}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }

  it("keeps free-form typing and filters the suggestion list", () => {
    const onChange = vi.fn();
    render(<ComboboxHarness onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "revision" });
    fireEvent.change(input, { target: { value: "v" } });

    expect(onChange).toHaveBeenLastCalledWith("v");
    expect(screen.getByRole("option", { name: "v0.2.0" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "main" }),
    ).not.toBeInTheDocument();
  });

  it("picks a suggestion by click and by keyboard", () => {
    const onChange = vi.fn();
    render(<ComboboxHarness onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "revision" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: "main" }));
    expect(onChange).toHaveBeenLastCalledWith("main");

    fireEvent.change(input, { target: { value: "HE" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("HEAD");
  });
});
