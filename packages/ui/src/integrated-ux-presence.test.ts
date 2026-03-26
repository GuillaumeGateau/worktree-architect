import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const featuresPanelSource = readFileSync(new URL("./FeaturesPanel.tsx", import.meta.url), "utf8");
const deskAvatarSource = readFileSync(new URL("./DeskAgentAvatars.tsx", import.meta.url), "utf8");

describe("integrated shared-office UX presence", () => {
  it("contains desk and office visualization sections in feature detail flow", () => {
    expect(featuresPanelSource).toContain("<DeskAgentAvatars figures={deskFigures} />");
    expect(featuresPanelSource).toContain(
      '<section className="office-stage card" aria-label="Shared office movement">'
    );
    expect(featuresPanelSource).toContain('<h3 className="subsection-title">Shared office</h3>');
    expect(deskAvatarSource).toContain('aria-label="Office desk agents"');
  });

  it("keeps office/desk UX visible while a feature run is executing", () => {
    expect(featuresPanelSource).toMatch(
      /\(detail\.feature\.status === "executing" \|\| deskFigures\.length > 0\)/
    );
    expect(featuresPanelSource).toMatch(
      /\(detail\.feature\.status === "executing" \|\| officeFigures\.length > 0\)/
    );
  });

  it("derives figure motion state from activity and steps", () => {
    expect(featuresPanelSource).toContain("deriveAgentStageState(activity, sortedSteps).figures");
    expect(featuresPanelSource).toContain("motionZoneForFigure(figure)");
    expect(featuresPanelSource).toContain("Agents leave their desk as work starts and return when complete.");
  });
});
