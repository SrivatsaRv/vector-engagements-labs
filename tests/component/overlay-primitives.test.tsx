import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Disclosure,
  OverlayProvider,
  VectorMenu,
  VectorPopover,
  VectorSelect,
} from "@/components/ui/OverlayPrimitives";

const options = [
  { value: "alpha", label: "Alpha" },
  { value: "bravo", label: "Bravo" },
  { value: "charlie", label: "Charlie with a deliberately long catalogue label" },
] as const;

function SelectHarness({ second = false }: { second?: boolean }) {
  const [first, setFirst] = useState<(typeof options)[number]["value"]>("alpha");
  const [next, setNext] = useState<(typeof options)[number]["value"]>("bravo");
  return (
    <OverlayProvider>
      <Disclosure defaultOpen summary="Persistent evidence">
        <p>Independent source evidence</p>
      </Disclosure>
      <VectorSelect label="First field" onChange={setFirst} options={options} value={first} />
      {second && (
        <VectorSelect label="Second field" onChange={setNext} options={options} value={next} />
      )}
    </OverlayProvider>
  );
}

function FamilyHarness({ onAction }: { onAction: (value: string) => void }) {
  const [value, setValue] = useState<(typeof options)[number]["value"]>("alpha");
  const popoverContent = ({ close }: { close: () => void }) => (
    <button onClick={close}>Done</button>
  );
  return (
    <OverlayProvider>
      <Disclosure defaultOpen summary="Persistent help">Always visible</Disclosure>
      <VectorSelect label="Choice" onChange={setValue} options={options} value={value} />
      <VectorMenu
        items={[{ value: "inspect", label: "Inspect" }, { value: "remove", label: "Remove" }]}
        label="Actions"
        onSelect={onAction}
        renderTrigger={({ open }) => open ? "Close actions" : "Open actions"}
      />
      <VectorPopover label="Context" renderTrigger={({ open }) => open ? "Close context" : "Open context"}>
        {popoverContent}
      </VectorPopover>
    </OverlayProvider>
  );
}

describe("shared overlay primitives", () => {
  it("keeps persistent disclosure state while pointer handoff leaves exactly one transient surface", async () => {
    const user = userEvent.setup();
    render(<SelectHarness second />);
    const disclosure = screen.getByText("Persistent evidence").closest("details")!;
    const first = screen.getByRole("combobox", { name: /first field: alpha/i });
    const second = screen.getByRole("combobox", { name: /second field: bravo/i });

    expect(disclosure).toHaveAttribute("data-vector-disclosure", "persistent");
    expect(disclosure).toHaveAttribute("open");
    await user.click(first);
    await user.click(second);

    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(disclosure).toHaveAttribute("open");
  });

  it("supports keyboard selection, typeahead, Escape focus return, outside press, and route close", async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);
    const trigger = screen.getByRole("combobox", { name: /first field: alpha/i });

    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByRole("combobox", { name: /first field: bravo/i })).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.keyboard("c");
    expect(screen.getByRole("listbox")).toBeVisible();
    expect(trigger).toHaveAttribute("aria-activedescendant", expect.stringMatching(/option-2$/));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("does not grow coordinator listeners or leave detached overlays over 100 rapid handoffs", async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const view = render(<SelectHarness second />);
    const first = screen.getByRole("combobox", { name: /first field: alpha/i });
    const second = screen.getByRole("combobox", { name: /second field: bravo/i });
    const coordinatorAdds = () => add.mock.calls.filter(([type]) =>
      type === "pointerdown" || type === "keydown" || type === "focusin"
    ).length;
    const baselineAdds = coordinatorAdds();

    for (let cycle = 0; cycle < 100; cycle += 1) {
      await user.click(cycle % 2 === 0 ? first : second);
    }

    expect(coordinatorAdds()).toBe(baselineAdds);
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(document.querySelectorAll("[data-vector-overlay=\"transient\"]")).toHaveLength(1);
    view.unmount();
    expect(document.querySelectorAll("[data-vector-overlay=\"transient\"]")).toHaveLength(0);
    expect(remove.mock.calls.filter(([type]) => type === "pointerdown")).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === "focusin")).toHaveLength(1);
    for (const type of ["resize", "scroll", "popstate", "hashchange"] as const) {
      expect(windowRemove.mock.calls.filter(([eventType]) => String(eventType) === type)).toHaveLength(
        windowAdd.mock.calls.filter(([eventType]) => String(eventType) === type).length,
      );
    }
    add.mockRestore();
    remove.mockRestore();
    windowAdd.mockRestore();
    windowRemove.mockRestore();
  });

  it("coordinates Select, Menu, and Popover while Disclosure remains persistent", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<FamilyHarness onAction={onAction} />);
    const disclosure = screen.getByText("Persistent help").closest("details")!;
    const select = screen.getByRole("combobox", { name: /choice: alpha/i });
    const menu = screen.getByRole("button", { name: "Actions" });
    const popover = screen.getByRole("button", { name: "Context" });

    await user.click(select);
    await user.click(menu);
    expect(select).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Inspect" })).toHaveFocus());

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onAction).toHaveBeenCalledWith("remove");
    await waitFor(() => expect(menu).toHaveFocus());

    await user.click(menu);
    await user.click(popover);
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(popover).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(popover).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(disclosure).toHaveAttribute("open");
  });
});
