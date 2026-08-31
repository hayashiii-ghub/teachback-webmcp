import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoundaryEditor } from "./BoundaryEditor";
import type { PlaybookBoundary } from "./domain";
import { copyFor, type UiLocale } from "./i18n";
import { LATE_ARRIVAL_PLAYBOOK, NIGHT_ARRIVAL_PLAYBOOK, type PlaybookDefinition } from "./teaching";

function renderCorrection(
  locale: UiLocale,
  definition: PlaybookDefinition,
  boundary: PlaybookBoundary,
  publishable = false,
) {
  const html = renderToStaticMarkup(createElement(BoundaryEditor, {
    locale, definition, boundary, publishable, onChange: () => {},
  }));
  const correction = html.match(/<p id="boundary-correction"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  expect(correction).toBeDefined();
  return { html, correction: correction!.replace(/<[^>]*>/g, " ") };
}

describe.each(["en", "ja"] as const)("%s boundary correction guidance", locale => {
  const copy = copyFor(locale);

  it("identifies the one change needed by the normal night-arrival draft", () => {
    const { correction } = renderCorrection(locale, NIGHT_ARRIVAL_PLAYBOOK, NIGHT_ARRIVAL_PLAYBOOK.agentDraftBoundary);
    expect(correction).toContain(`${copy.compensationRule}: ${copy.taxiEscalate}`);
    expect(correction).not.toContain(copy.latestArrivalRule);
    expect(correction).not.toContain(copy.dietaryRule);
    expect(correction).not.toContain(copy.taxiRule);
  });

  it("identifies both changes needed by the normal late-arrival draft", () => {
    const { correction } = renderCorrection(locale, LATE_ARRIVAL_PLAYBOOK, LATE_ARRIVAL_PLAYBOOK.agentDraftBoundary);
    expect(correction).toContain(`${copy.latestArrivalRule}: 22:00`);
    expect(correction).toContain(`${copy.taxiRule}: ${copy.taxiEscalate}`);
    expect(correction).not.toContain(copy.dietaryRule);
    expect(correction).not.toContain(copy.compensationRule);
  });

  it("does not tell the person to correct compensation when only a WebMCP arrival limit differs", () => {
    const { correction } = renderCorrection(locale, NIGHT_ARRIVAL_PLAYBOOK, {
      ...NIGHT_ARRIVAL_PLAYBOOK.boundary, latestArrivalLimit: "23:00",
    });
    expect(correction).toContain(`${copy.latestArrivalRule}: 23:59`);
    expect(correction).not.toContain(copy.compensationRule);
    expect(correction).not.toContain(copy.taxiRule);
  });

  it("removes already-corrected fields and includes other mismatches from the actual draft", () => {
    const { correction } = renderCorrection(locale, LATE_ARRIVAL_PLAYBOOK, {
      ...LATE_ARRIVAL_PLAYBOOK.boundary,
      dietaryHandling: "allow",
      compensationHandling: "allow",
    });
    expect(correction).toContain(`${copy.dietaryRule}: ${copy.taxiEscalate}`);
    expect(correction).toContain(`${copy.compensationRule}: ${copy.taxiEscalate}`);
    expect(correction).not.toContain(copy.latestArrivalRule);
    expect(correction).not.toContain(copy.taxiRule);
  });

  it("shows ready confirmation without stale correction guidance when all conditions match", () => {
    const { html, correction } = renderCorrection(locale, NIGHT_ARRIVAL_PLAYBOOK, NIGHT_ARRIVAL_PLAYBOOK.boundary, true);
    expect(correction).toBe(copy.publishReady);
    expect(html).not.toContain('aria-describedby="boundary-correction"');
  });
});
