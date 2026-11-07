import * as React from "react";
import "./anatomy.css";
import { AxiomAnatomyArt } from "./art";
import { Plate } from "./kit/react/draw";
import { DEFAULT_READOUT } from "./model";

export function AxiomAnatomy() {
  return (
    <div className="iso axiom-anatomy-root" data-theme="dark">
      <Plate
        fig="Fig. 1"
        title="Axiom verification & reflexion bench"
        hint="Hover or Space: take apart · Click station: inspect · R: run trial"
        readout={DEFAULT_READOUT}
        caption="Fig. 1 · Illustration, not telemetry"
        keys={[
          { mark: "lit", label: "Active station / gauge" },
          { mark: "blue", label: "Retrieval & PG 16 check" },
          { mark: "red", label: "Failed verdict (<fact id>)" },
          { mark: "green", label: "Retry pass & promotion gate" },
        ]}
      >
        <AxiomAnatomyArt />
      </Plate>
    </div>
  );
}

export default AxiomAnatomy;
