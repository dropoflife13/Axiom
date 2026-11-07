import * as React from "react";
import { Dots, FaceText, Line, Solid, Wire } from "./kit/react/draw";
import {
  AD_ANVIL,
  AD_BRIDGE,
  AD_EMBOSSER,
  AD_INTERLOCK,
  AD_PIER_BACK,
  AD_PIER_FRONT,
  AD_TEXT_MATRIX,
  BED_SCALE_OUTLINE,
  BED_SCALE_TICKS,
  BED_WIRES,
  COND_BASE,
  COND_FRONT_MATRIX,
  COND_STOPS,
  COND_TEXT_MATRIX,
  EX_ANVIL,
  EX_CAP,
  EX_CROWN,
  EX_PIER_BACK,
  EX_PIER_FRONT,
  EX_SIDE_MATRIX,
  EX_TEXT_MATRIX,
  EX_TURRET,
  GR_BACKOFF_POT,
  GR_BASE,
  GR_BUDGET_CAP,
  GR_BUDGET_VALVE,
  GR_CACHE_BLOCK,
  GR_CACHE_OUTLINE,
  GR_CACHE_TICKS,
  GR_MANIFOLD,
  GR_TEXT_MATRIX,
  MAIN_RAIL_GROOVE,
  MEM_BASE,
  MEM_CAP,
  MEM_PLATES,
  MEM_TEXT_MATRIX,
  MEM_TRAY,
  OR_APP_GAUGE,
  OR_CRADLE,
  OR_DECK,
  OR_DEPLOYER_CAP,
  OR_DEPLOYER_RAM,
  OR_DIAL_INNER,
  OR_DIAL_OUTER,
  OR_DIAL_TICKS,
  OR_PIER_BACK,
  OR_PIER_FRONT,
  OR_SIDE_MATRIX,
  OR_TEXT_MATRIX,
  PASS_BASE,
  PASS_PLATEN,
  PASS_POST,
  PASS_TEXT_MATRIX,
  QU_BASE,
  QU_BIN,
  QU_CANDIDATE_1,
  QU_CANDIDATE_2,
  QU_GATE_MATRIX,
  QU_GATE_WALL,
  QU_LOCK_CYL,
  QU_SHELF,
  QU_SHELF_INSET,
  QU_TEXT_MATRIX,
  RET_BASE,
  RET_BEAM,
  RET_COMB,
  RET_POST_L,
  RET_POST_R,
  RET_RACK,
  RET_SCALE_OUTLINE,
  RET_SCALE_TICKS,
  RET_TEXT_MATRIX,
  RETURN_RAIL_GROOVE,
  STAND_BED,
  STAND_BED_DOTS,
  STAND_BED_INSET,
  STAND_FEET,
  STAND_RAILS,
  STATION_HALOS,
  TG_BASE,
  TG_HOPPERS,
  TG_MANIFOLD,
  TG_SEED_DRUM,
  TG_TEXT_MATRIX,
  VE_BRIDGE,
  VE_CHUTE,
  VE_PIER_BACK,
  VE_PIER_FRONT,
  VE_PUNCH,
  VE_TAG_OUTLINE,
  VE_TAG_TRAY,
  VE_TEXT_MATRIX,
  type CylinderPiece,
  type SlabPiece,
} from "./geometry";
import { AxiomAnatomyLive, type StationArtBundle } from "./live";
import type { StationId } from "./model";

function renderSlab(piece: SlabPiece, extraChildren?: React.ReactNode) {
  return (
    <Solid
      key={piece.id}
      paths={piece.paths}
      tone={piece.tone ?? "hi"}
      lit={piece.lit}
      halo={piece.halo}
      inner={piece.seam ? <Line d={piece.seam} tone="faint" /> : undefined}
    >
      {extraChildren}
    </Solid>
  );
}

function renderCyl(piece: CylinderPiece, extraChildren?: React.ReactNode) {
  return (
    <Solid
      key={piece.id}
      paths={piece.paths}
      tone={piece.tone ?? "hi"}
      lit={piece.lit}
      inner={
        piece.seam || piece.knurl ? (
          <>
            {piece.seam ? <Line d={piece.seam} tone="faint" /> : null}
            {piece.knurl ? <Line d={piece.knurl} tone="lo" /> : null}
          </>
        ) : undefined
      }
    >
      {piece.topRing ? <Line d={piece.topRing} tone="lo" /> : null}
      {extraChildren}
    </Solid>
  );
}

const STAND_ART = (
  <g key="stand" data-part="stand">
    {STAND_FEET.map((foot) => renderSlab(foot))}
    {renderSlab(
      STAND_BED,
      <>
        <Line d={STAND_BED_INSET} tone="faint" />
        <Dots points={STAND_BED_DOTS} size={0.42} tone="faint" />
        <Line d={BED_SCALE_OUTLINE} tone="faint" />
        <Line d={BED_SCALE_TICKS.minor} tone="faint" />
        <Line d={BED_SCALE_TICKS.major} tone="lo" />
      </>,
    )}
    {BED_WIRES.map((wire) => (
      <Wire
        key={wire.id}
        from={wire.from}
        via={wire.via}
        to={wire.to}
        tone={wire.tone}
        dashed={wire.dashed}
        flow={wire.flow}
        ends="both"
        size={1.0}
      />
    ))}
    {STAND_RAILS.map((rail) => renderSlab(rail))}
    <Line d={MAIN_RAIL_GROOVE} tone="lo" />
    <Line d={RETURN_RAIL_GROOVE} tone="lo" />
    {renderSlab(
      COND_BASE,
      <>
        <FaceText transform={COND_TEXT_MATRIX} size={3.1} tone="hi">
          6×120=720
        </FaceText>
        <FaceText transform={COND_FRONT_MATRIX} size={2.6} tone="mid">
          A B C C0 D E_B
        </FaceText>
      </>,
    )}
    {COND_STOPS.map(({ code, piece, labelMatrix }) => (
      <React.Fragment key={code}>
        {renderCyl(piece)}
        <FaceText transform={labelMatrix} size={2.5} tone="mid" anchor="middle">
          {code}
        </FaceText>
      </React.Fragment>
    ))}
    {renderSlab(
      PASS_BASE,
      <FaceText transform={PASS_TEXT_MATRIX} size={3.0} tone="mid">
        PASS
      </FaceText>,
    )}
    {renderSlab(PASS_PLATEN)}
    {renderCyl(PASS_POST)}
  </g>
);

const STATIONS_ART: Record<StationId, StationArtBundle> = {
  "task-generator": {
    hitPath: STATION_HALOS["task-generator"],
    body: (
      <g key="tg-body">
        {renderSlab(
          TG_BASE,
          <FaceText transform={TG_TEXT_MATRIX} size={3.1} tone="hi">
            40/40/120
          </FaceText>,
        )}
        {renderSlab(TG_MANIFOLD)}
        {TG_HOPPERS.map(({ label, piece, slotOutline, textMatrix }) =>
          renderSlab(
            piece,
            <>
              <Line d={slotOutline} tone="lo" />
              <FaceText transform={textMatrix} size={2.7} tone="hi" anchor="middle">
                {label}
              </FaceText>
            </>,
          ),
        )}
        {renderCyl(TG_SEED_DRUM)}
      </g>
    ),
  },
  retrieval: {
    hitPath: STATION_HALOS.retrieval,
    body: (
      <g key="ret-body">
        {renderSlab(RET_BASE)}
        {renderSlab(RET_RACK)}
        {renderCyl(RET_POST_L)}
        {renderCyl(RET_POST_R)}
        {renderSlab(
          RET_BEAM,
          <FaceText transform={RET_TEXT_MATRIX} size={3.2} tone="hi">
            TOP k=6
          </FaceText>,
        )}
      </g>
    ),
    moving: (
      <g key="ret-moving">
        {renderSlab(
          RET_COMB,
          <>
            <Line d={RET_SCALE_OUTLINE} tone="lo" />
            <Line d={RET_SCALE_TICKS.minor} tone="lo" />
            <Line d={RET_SCALE_TICKS.major} tone="hi" />
          </>,
        )}
      </g>
    ),
  },
  memory: {
    hitPath: STATION_HALOS.memory,
    body: (
      <g key="mem-body">
        {renderSlab(
          MEM_BASE,
          <FaceText transform={MEM_TEXT_MATRIX} size={3.0} tone="hi">
            MEMORY · k=6
          </FaceText>,
        )}
        {renderSlab(MEM_TRAY)}
        {MEM_PLATES.map((plate) => renderSlab(plate))}
        {renderCyl(MEM_CAP)}
      </g>
    ),
  },
  guardrails: {
    hitPath: STATION_HALOS.guardrails,
    body: (
      <g key="gr-body">
        {renderSlab(GR_BASE)}
        {renderSlab(GR_MANIFOLD)}
        {renderCyl(GR_BUDGET_VALVE)}
        {renderCyl(GR_BUDGET_CAP)}
        {renderCyl(GR_BACKOFF_POT)}
        {renderSlab(
          GR_CACHE_BLOCK,
          <>
            <Line d={GR_CACHE_OUTLINE} tone="lo" />
            <Line d={GR_CACHE_TICKS.minor} tone="lo" />
            <Line d={GR_CACHE_TICKS.major} tone="hi" />
            <FaceText transform={GR_TEXT_MATRIX} size={2.7} tone="mid">
              CACHE
            </FaceText>
          </>,
        )}
      </g>
    ),
  },
  executor: {
    hitPath: STATION_HALOS.executor,
    body: (
      <g key="ex-body">
        {renderSlab(EX_PIER_BACK)}
        {renderSlab(EX_ANVIL)}
        {renderSlab(EX_PIER_FRONT)}
        {renderSlab(
          EX_CROWN,
          <>
            <FaceText transform={EX_TEXT_MATRIX} size={3.2} tone="hi">
              EXEC · T=0
            </FaceText>
            <FaceText transform={EX_SIDE_MATRIX} size={2.7} tone="mid">
              TEMP 0
            </FaceText>
          </>,
        )}
      </g>
    ),
    moving: (
      <g key="ex-moving">
        {renderCyl(EX_TURRET)}
        {renderCyl(EX_CAP)}
      </g>
    ),
  },
  oracle: {
    hitPath: STATION_HALOS.oracle,
    body: (
      <g key="or-body">
        {renderSlab(OR_PIER_BACK)}
        {renderSlab(OR_CRADLE)}
        {renderSlab(OR_PIER_FRONT)}
        {renderSlab(
          OR_DECK,
          <>
            <FaceText transform={OR_TEXT_MATRIX} size={3.2} tone="hi">
              PG 16 · ORACLE
            </FaceText>
            <FaceText transform={OR_SIDE_MATRIX} size={2.6} tone="mid">
              DEPLOYER / APP
            </FaceText>
          </>,
        )}
        {renderCyl(
          OR_APP_GAUGE,
          <>
            <Line d={OR_DIAL_OUTER} tone="lo" />
            <Line d={OR_DIAL_TICKS.minor} tone="lo" />
            <Line d={OR_DIAL_TICKS.major} tone="hi" />
            <Line d={OR_DIAL_INNER} tone="mid" />
          </>,
        )}
      </g>
    ),
    moving: (
      <g key="or-moving">
        {renderCyl(OR_DEPLOYER_RAM)}
        {renderCyl(OR_DEPLOYER_CAP)}
      </g>
    ),
  },
  quarantine: {
    hitPath: STATION_HALOS.quarantine,
    body: (
      <g key="qu-body">
        {renderSlab(QU_BASE)}
        {renderSlab(QU_BIN)}
        {renderSlab(QU_CANDIDATE_1)}
        {renderSlab(QU_CANDIDATE_2)}
        {renderSlab(
          QU_GATE_WALL,
          <FaceText transform={QU_GATE_MATRIX} size={2.9} tone="hi">
            GATE
          </FaceText>,
        )}
        {renderCyl(QU_LOCK_CYL)}
        {renderSlab(
          QU_SHELF,
          <>
            <Line d={QU_SHELF_INSET} tone="lo" />
            <FaceText transform={QU_TEXT_MATRIX} size={2.9} tone="hi">
              PROMOTED
            </FaceText>
          </>,
        )}
      </g>
    ),
  },
  advisor: {
    hitPath: STATION_HALOS.advisor,
    body: (
      <g key="ad-body">
        {renderSlab(AD_PIER_BACK)}
        {renderSlab(AD_ANVIL)}
        {renderSlab(AD_PIER_FRONT)}
        {renderSlab(
          AD_BRIDGE,
          <FaceText transform={AD_TEXT_MATRIX} size={3.0} tone="hi">
            ADVISOR · 1/FACT
          </FaceText>,
        )}
        {renderCyl(AD_INTERLOCK)}
      </g>
    ),
    moving: <g key="ad-moving">{renderCyl(AD_EMBOSSER)}</g>,
  },
  verdict: {
    hitPath: STATION_HALOS.verdict,
    body: (
      <g key="ve-body">
        {renderSlab(VE_PIER_BACK)}
        {renderSlab(VE_CHUTE)}
        {renderSlab(VE_PIER_FRONT)}
        {renderSlab(
          VE_BRIDGE,
          <FaceText transform={VE_TEXT_MATRIX} size={3.0} tone="hi">
            VERDICT · TAG
          </FaceText>,
        )}
        {renderSlab(
          VE_TAG_TRAY,
          <Line d={VE_TAG_OUTLINE} tone="lo" />,
        )}
      </g>
    ),
    moving: <g key="ve-moving">{renderCyl(VE_PUNCH)}</g>,
  },
};

export function AxiomAnatomyArt() {
  return <AxiomAnatomyLive stand={STAND_ART} stations={STATIONS_ART} />;
}
