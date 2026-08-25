import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ObjectPicker } from "@/components/ObjectPicker";
import { OverlayProvider } from "@/components/ui/OverlayPrimitives";
import { OBJECT_CATALOG } from "@/lib/object-catalog";

const aircraft = OBJECT_CATALOG.filter((item) => item.kind === "AIRCRAFT").slice(0, 2);

describe("ObjectPicker", () => {
  it("preserves and exposes a stale authored identity instead of substituting the first option", () => {
    render(
      <OverlayProvider>
        <ObjectPicker
          label="Aircraft variant"
          value="removed-aircraft-id"
          options={aircraft}
          team="blue"
          onChange={vi.fn()}
        />
      </OverlayProvider>,
    );

    const trigger = screen.getByRole("combobox", {
      name: /aircraft variant.*unavailable selection.*removed-aircraft-id/i,
    });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("removed-aircraft-id");
    expect(trigger).not.toHaveTextContent(aircraft[0].designation);
  });

  it("binds the labelled trigger to its listbox and hands off to a sibling in one click", async () => {
    const user = userEvent.setup();
    render(
      <OverlayProvider>
        <ObjectPicker
          label="Aircraft variant"
          value={aircraft[0].id}
          options={aircraft}
          team="blue"
          onChange={vi.fn()}
        />
        <ObjectPicker
          label="Opponent aircraft"
          value={aircraft[1].id}
          options={aircraft}
          team="red"
          onChange={vi.fn()}
        />
      </OverlayProvider>,
    );

    const first = screen.getByRole("combobox", {
      name: new RegExp(`Aircraft variant.*${aircraft[0].designation}`, "i"),
    });
    const second = screen.getByRole("combobox", {
      name: new RegExp(`Opponent aircraft.*${aircraft[1].designation}`, "i"),
    });
    expect(first).toHaveAttribute("aria-controls");
    await user.click(first);
    expect(screen.getAllByRole("listbox")).toHaveLength(1);

    await user.click(second);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "id",
      second.getAttribute("aria-controls"),
    );
  });

  it("preserves the authored identity when a catalog refresh or permission filter removes it", () => {
    const view = render(
      <OverlayProvider>
        <ObjectPicker
          label="Aircraft variant"
          value={aircraft[0].id}
          options={aircraft}
          team="blue"
          onChange={vi.fn()}
        />
      </OverlayProvider>,
    );
    expect(screen.getByRole("combobox", {
      name: new RegExp(`Aircraft variant.*${aircraft[0].designation}`, "i"),
    })).not.toHaveAttribute("aria-invalid");

    view.rerender(
      <OverlayProvider>
        <ObjectPicker
          label="Aircraft variant"
          value={aircraft[0].id}
          options={aircraft.slice(1)}
          team="blue"
          onChange={vi.fn()}
        />
      </OverlayProvider>,
    );

    const stale = screen.getByRole("combobox", {
      name: new RegExp(`Aircraft variant.*Unavailable selection.*${aircraft[0].id}`, "i"),
    });
    expect(stale).toHaveAttribute("aria-invalid", "true");
    expect(stale).not.toHaveTextContent(aircraft[1].designation);
  });
});
