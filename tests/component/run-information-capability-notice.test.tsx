import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RunInformationCapabilityNotice } from "../../components/RunInformationCapabilityNotice";
import { CURRENT_COMPILED_MODEL_PACK } from "../../lib/engine/weapon-admission";
import { runtimeObserverSensors } from "../../lib/engine/runtime-model-pack";
import { projectRunInformationCapabilities } from "../../lib/frontend/information-capability";
import { DEPLOYMENT_CAPABILITIES } from "../../lib/runtime/deployment-capabilities";

describe("RunInformationCapabilityNotice", () => {
  it("presents exact current-run limitations instead of deployment switches", () => {
    render(
      <RunInformationCapabilityNotice
        capabilities={projectRunInformationCapabilities({
          manifest: DEPLOYMENT_CAPABILITIES,
          observerSensors: runtimeObserverSensors(CURRENT_COMPILED_MODEL_PACK),
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "This run has no tactical information or autonomous pilot model.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Red carries recorded loadout inventory",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "does not decide, defend in response to a detection, or release a weapon",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("AIM-120");
    expect(screen.getByText("Sensors and tracks").nextElementSibling).toHaveTextContent(
      "no positive-range sensor model",
    );
    expect(screen.getByText("Electronic warfare").nextElementSibling).toHaveTextContent(
      "no compiled EW model",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Sensors: enabled");
    expect(screen.getByRole("status")).not.toHaveTextContent("EW: enabled");
  });
});
