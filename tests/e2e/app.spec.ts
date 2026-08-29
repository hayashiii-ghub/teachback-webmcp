import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset demo" }).click();
});

test("opens directly on the reusable reservation demo", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Emma Wilson" })).toBeVisible();
  await expect(page.getByText("How this playbook was created", { exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create draft" }))
    .toHaveCount(0);
});

test("prepares, approves, and keeps commit bound to the agent tool", async ({ page }) => {
  await expect(
    page.getByText(
      "Reuse one taught workflow with conditions and approval.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.locator(".case-list").getByText("Handled", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.locator(".case-list").getByText("Unhandled", { exact: true }),
  ).toHaveCount(6);
  await expect(page.getByText(/^\d+–\d+ of 8$/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show more cases" }),
  ).toBeEnabled();
  await expect(page.getByText("Ready to teach", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No matching rule", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Show once. Set the boundaries. Reuse safely.", {
      exact: true,
    }),
  ).toHaveCount(0);
  const flow = page.getByRole("region", { name: "How Teachback reuses work" });
  await expect(flow.getByText("Taught from", { exact: true })).toBeVisible();
  await expect(flow.getByText("R-2041", { exact: true })).toBeVisible();
  await expect(flow.getByText("Late Arrival Care")).toBeVisible();
  await expect(flow.getByText("7 rules · approval every run")).toBeVisible();
  await expect(page.getByText("Not checked yet", { exact: true })).toBeVisible();
  await expect(page.locator(".eligibility-list .check-icon")).toHaveCount(0);
  await expect(
    page.getByText("Review only", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    })
    .click();
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();
  await expect(page.getByText("No changes have been applied.")).toBeVisible();
  await expect(page.getByText("7 of 7 conditions met", { exact: true })).toBeVisible();
  await expect(page.locator(".eligibility-list .check-icon")).toHaveCount(0);
  await expect(page.getByText("Approval", { exact: true })).toBeVisible();
  await expect(page.getByText("One use after approval · valid for 5 minutes", {
    exact: true,
  })).toBeVisible();
  await expect(page.locator(".timeline-node")).toHaveCount(0);
  await expect(page.locator(".approval-scope")).toHaveCSS("border-top-width", "1px");
  await expect(page.locator(".approval-scope")).toHaveCSS("border-right-width", "0px");
  await expect(page.getByText("teachback_commit_approved", { exact: true }))
    .toHaveCount(0);

  await page.getByRole("button", { name: "Approve preview" }).click();
  await expect(page.getByText("Approved for this proposal", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("7/7 conditions met", { exact: true })).toBeVisible();
  await expect(page.getByText("Awaiting review", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Open this page in a supported browser to apply the approved change.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".approval-expiry time")).toHaveText(
    /^\d{2}:\d{2} JST$/,
  );
  await expect(page.locator(".approval-expiry time")).toHaveAttribute(
    "datetime",
    /^\d{4}-\d{2}-\d{2}T/,
  );
});

test("switches to Japanese without changing the prepared run", async ({ page }) => {
  await page.getByRole("button", { name: "日本語" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page).toHaveTitle("Teachback — 現場の判断を安全に引き継ぐ");
  await expect(page.getByRole("heading", { name: "予約一覧" })).toBeVisible();
  await expect(
    page.getByText("一度教える。任せる範囲を決める。安心して繰り返す。", {
      exact: true,
    }),
  ).toHaveCount(0);
  const flow = page.getByRole("region", { name: "対応ルール" });
  await expect(flow.getByText("作成元", { exact: true })).toBeVisible();
  await expect(flow.getByText("R-2041", { exact: true })).toBeVisible();
  await expect(flow.getByText("7条件 · 毎回承認", { exact: true })).toBeVisible();
  await expect(page.getByText("Built in Japan", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "一度教えた対応を、条件と承認付きで再利用する。",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "条件を確認して変更案を作る", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "変更案" })).toBeVisible();
  await expect(page.getByText("遅い到着向けのお食事")).toBeVisible();

  const exactGuestMessage = page.getByText(
    "We have noted your late arrival. Your meal box will be ready at reception.",
    { exact: true },
  );
  await expect(exactGuestMessage).toHaveAttribute("lang", "en");
  const digestBeforeSwitch = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    return saved?.activeRun?.digest;
  });

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { name: "変更案" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();

  const digestAfterSwitch = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    return saved?.activeRun?.digest;
  });
  expect(digestAfterSwitch).toBe(digestBeforeSwitch);
});

test("withholds evaluation when no reusable rule applies", async ({ page }) => {
  await page.getByRole("button", { name: /R-2052\s+Daniel Kim/ }).click();

  await expect(
    page.locator(".review-panel").getByText(
      "No reusable rule applies to this reservation",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Ready to reuse this playbook",
    }),
  ).toHaveCount(0);
});

test("keeps implementation details out of the teaching workspace", async ({
  page,
}) => {
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
  await page.getByRole("button", { name: "Teach from this case" }).click();

  await expect(page.getByText("Full Teachback demo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Available · 5 tools", { exact: true })).toHaveCount(0);
  await expect(page.locator(".tool-proof")).toHaveCount(0);
  await expect(page.getByText("teachback_get_latest_demonstration", { exact: true }))
    .toHaveCount(0);
});

test("uses spacing instead of stacked dividers in the source action", async ({
  page,
}) => {
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();

  const dividerWidths = await page
    .locator(".review-heading-row, .source-case-note, .demo-footnote")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          top: style.borderTopWidth,
          bottom: style.borderBottomWidth,
        };
      }),
    );

  expect(dividerWidths).toEqual([
    { top: "0px", bottom: "0px" },
    { top: "0px", bottom: "0px" },
    { top: "1px", bottom: "0px" },
  ]);
});

test("teaches a second playbook and unlocks Daniel", async ({ page }) => {
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
  await expect(page.getByRole("heading", { name: "Sofia Rossi" })).toBeVisible();
  await page.getByRole("button", { name: "Teach from this case" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Create a reusable rule",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sofia Rossi" })).toBeVisible();
  await expect(page.locator(".teaching-record li")).toHaveCount(5);

  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Fixed safeguards", { exact: true })).toBeVisible();
  await expect(page.getByText("Set the boundary", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest arrival", { exact: true })).toBeVisible();
  await expect(page.locator(".night-boundary-summary").getByText("23:59", {
    exact: true,
  })).toBeVisible();
  await expect(page.locator(".night-boundary-summary")).toHaveCSS(
    "border-right-width",
    "0px",
  );
  await page
    .getByRole("button", { name: "Publish reusable rule" })
    .click();

  await expect(page.getByRole("heading", { name: "Daniel Kim" })).toBeVisible();
  const selectedCardIsVisible = await page
    .locator('.case-item[aria-current="true"]')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth;
    });
  expect(selectedCardIsVisible).toBe(true);
  const flow = page.getByRole("region", { name: "How Teachback reuses work" });
  await expect(flow.getByText("R-2050", { exact: true })).toBeVisible();
  await expect(flow.getByText("Night Arrival Coordination")).toBeVisible();

  await page
    .getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    })
    .click();
  await expect(page.getByText("Dietary request", { exact: true })).toBeVisible();
  await expect(page.getByText("Taxi", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Proposed changes" })
      .getByText("Handled", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Arranged", { exact: true })).toBeVisible();
});

test("rejects a saved state that mixes a preview with a refusal", async ({
  page,
}) => {
  await page
    .getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    })
    .click();
  await page.evaluate(() => {
    const key = "teachback-demo-v1";
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    saved.rejection = {
      reservationId: "R-2048",
      reasons: ["Arrival is later than 22:00."],
    };
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();

  await expect(page.getByRole("button", { name: "Approve preview" })).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    return { activeRun: saved?.activeRun, rejection: saved?.rejection };
  })).toEqual({ activeRun: null, rejection: null });
});

test("keeps the teaching source bound to R-2041", async ({ page }) => {
  await page.evaluate(() => {
    const key = "teachback-demo-v1";
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    saved.reservations = saved.reservations.map(
      (reservation: { id: string; label: string }) => ({
        ...reservation,
        label:
          reservation.id === "R-2041"
            ? "Needs review"
            : reservation.id === "R-2052"
              ? "Recorded"
              : reservation.label,
      }),
    );
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();

  const flow = page.getByRole("region", { name: "How Teachback reuses work" });
  await expect(flow.getByText("R-2041", { exact: true })).toBeVisible();
  await expect(flow.getByText("R-2052", { exact: true })).toHaveCount(0);
});

test("treats the recorded reservation as the teaching source", async ({ page }) => {
  await page.getByRole("button", { name: /R-2041\s+Aiko Tanaka/ }).click();

  await expect(
    page.getByRole("heading", { name: "The playbook was taught here" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /R-2041\s+Aiko Tanaka\s+Handled/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "How Teachback reuses work" })
      .getByText("R-2041", { exact: true }),
  ).toBeVisible();
});

test("returns the checklist to pending after discarding a preview", async ({
  page,
}) => {
  await page
    .getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    })
    .click();
  await expect(page.getByText("7 of 7 conditions met", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("Not checked yet", { exact: true })).toBeVisible();
  await expect(page.locator(".eligibility-list .check-icon")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    }),
  ).toBeVisible();
});

test("registers WebMCP tools without exposing technical readiness", async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { registeredTeachbackTools?: string[] };
    testWindow.registeredTeachbackTools = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (tool: { name: string }) => {
          testWindow.registeredTeachbackTools?.push(tool.name);
        },
      },
    });
  });
  await page.reload();

  await expect(page.getByText("Ready to apply", { exact: true })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => {
    const testWindow = window as Window & { registeredTeachbackTools?: string[] };
    return testWindow.registeredTeachbackTools?.length ?? 0;
  })).toBe(5);
  expect(await page.evaluate(() => {
    const testWindow = window as Window & { registeredTeachbackTools?: string[] };
    return testWindow.registeredTeachbackTools;
  })).toEqual([
    "teachback_get_latest_demonstration",
    "teachback_submit_playbook_draft",
    "teachback_get_current_case",
    "teachback_prepare_current",
    "teachback_commit_approved",
  ]);

  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.getByText("反映できます", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const testWindow = window as Window & { registeredTeachbackTools?: string[] };
    return testWindow.registeredTeachbackTools?.length;
  })).toBe(5);

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null"),
  );
  expect(saved).not.toHaveProperty("webMcpStatus");
});

test("keeps the review flow usable when WebMCP registration fails", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async () => {
          throw new Error("Registration unavailable");
        },
      },
    });
  });
  await page.reload();

  await expect(page.getByText("Changes cannot be applied", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Emma Wilson" })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("Japanese UI has no horizontal page overflow", async ({ page }) => {
  await page.getByRole("button", { name: "日本語" }).click();
  for (const width of [
    390,
    768,
    900,
    1023,
    1024,
    1120,
    1279,
    1280,
    1440,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `overflow at ${width}px`).toBeLessThanOrEqual(
      dimensions.clientWidth,
    );
  }
});

test("separates selection from success and reveals the next mobile case", async ({
  page,
}) => {
  await page.getByRole("button", { name: "日本語" }).click();
  await page.setViewportSize({ width: 390, height: 844 });

  const selected = page.locator('.case-item[aria-current="true"]');
  const selectedColors = await selected.evaluate((item) => {
    const primary = item.querySelector(".case-primary");
    const secondary = item.querySelector(".case-secondary");
    if (!primary || !secondary) throw new Error("Missing case labels");
    return {
      border: getComputedStyle(item).borderBottomColor,
      primary: getComputedStyle(primary).color,
      secondary: getComputedStyle(secondary).color,
      success: getComputedStyle(document.documentElement)
        .getPropertyValue("--success")
        .trim(),
    };
  });
  expect(selectedColors.primary).not.toBe(selectedColors.success);
  expect(selectedColors.secondary).not.toBe(selectedColors.success);
  expect(selectedColors.border).not.toBe(selectedColors.success);

  const cases = await page.locator(".case-item").evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right) };
    }),
  );
  expect(cases[2].left).toBeLessThan(390);
  expect(cases[2].right).toBeGreaterThan(390);
});

test("keeps the workspace height stable when switching reservations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });

  const readVerticalLayout = () =>
    page.evaluate(() => {
      const queue = document.querySelector(".case-queue");
      const workspace = document.querySelector(".reservation-workspace");
      if (!queue || !workspace) throw new Error("Missing reservation layout");
      const queueBox = queue.getBoundingClientRect();
      const workspaceBox = workspace.getBoundingClientRect();
      return {
        queueHeight: Math.round(queueBox.height),
        workspaceTop: Math.round(workspaceBox.top),
      };
    });

  const emma = await readVerticalLayout();
  await page.getByRole("button", { name: /R-2041 Aiko Tanaka/ }).click();
  const aiko = await readVerticalLayout();

  expect(aiko).toEqual(emma);
});

test("keeps intermediate-width sections in a coherent reading order", async ({
  page,
}) => {
  const readLayout = () =>
    page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const box = element.getBoundingClientRect();
        return {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      };

      return {
        header: rect(".app-header"),
        cases: rect(".case-queue"),
        main: rect(".reservation-workspace"),
        review: rect(".review-panel"),
      };
    });

  await page.setViewportSize({ width: 1024, height: 900 });
  const wideTablet = await readLayout();
  expect(wideTablet.header.height).toBe(100);
  expect(wideTablet.cases).toMatchObject({ x: 0, width: 1024 });
  expect(wideTablet.main.x).toBe(0);
  expect(wideTablet.main.y).toBe(wideTablet.review.y);
  expect(wideTablet.main.x + wideTablet.main.width).toBe(wideTablet.review.x);
  expect(wideTablet.review.width).toBeGreaterThanOrEqual(320);

  for (const width of [1023, 900, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const splitTablet = await readLayout();
    expect(splitTablet.header.height, `header at ${width}px`).toBe(100);
    expect(splitTablet.cases, `cases at ${width}px`).toMatchObject({
      x: 0,
      width,
    });
    expect(splitTablet.main.x, `main at ${width}px`).toBe(0);
    expect(splitTablet.main.y, `main at ${width}px`).toBe(
      splitTablet.review.y,
    );
    expect(
      splitTablet.main.x + splitTablet.main.width,
      `split at ${width}px`,
    ).toBe(splitTablet.review.x);
    expect(splitTablet.review.x + splitTablet.review.width).toBe(width);
    expect(splitTablet.review.width).toBeGreaterThanOrEqual(320);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  const desktop = await readLayout();
  expect(desktop.main.y).toBe(desktop.review.y);
  expect(desktop.cases).toMatchObject({ x: 0, width: 1280 });
  expect(desktop.cases.y + desktop.cases.height).toBe(desktop.main.y);
  expect(desktop.main.x).toBe(0);
  expect(desktop.main.x + desktop.main.width).toBe(desktop.review.x);

  await page.setViewportSize({ width: 767, height: 900 });
  const mobile = await readLayout();
  expect(mobile.cases).toMatchObject({ x: 0, width: 767 });
  expect(mobile.main).toMatchObject({ x: 0, width: 767 });
  expect(mobile.review).toMatchObject({ x: 0, width: 767 });
  expect(mobile.review.y).toBe(mobile.main.y + mobile.main.height);
});

test("aligns every case card when a name wraps", async ({
  page,
}) => {
  await page.getByRole("button", { name: "日本語" }).click();
  await page.setViewportSize({ width: 820, height: 900 });

  const readCardAlignment = () =>
    page.locator(".case-item").evaluateAll((cards) =>
      cards.map((card) => ({
        height: Math.round(card.getBoundingClientRect().height),
        idTop: Math.round(
          card
            .querySelector(".case-primary > span:first-child")!
            .getBoundingClientRect().top,
        ),
        stateTop: Math.round(
          card.querySelector(".case-secondary")!.getBoundingClientRect().top,
        ),
      })),
    );

  const expectAligned = async () => {
    const cards = await readCardAlignment();
    expect(new Set(cards.map(({ height }) => height)).size).toBe(1);
    expect(new Set(cards.map(({ idTop }) => idTop)).size).toBe(1);
    expect(new Set(cards.map(({ stateTop }) => stateTop)).size).toBe(1);
  };

  await expectAligned();

  await page
    .getByRole("button", { name: "条件を確認して変更案を作る" })
    .click();
  await expectAligned();
});

test("keeps case cards inside the queue at intermediate widths", async ({ page }) => {
  await page.getByRole("button", { name: "日本語" }).click();
  await page.setViewportSize({ width: 940, height: 900 });
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();

  const geometry = await page.evaluate(() => {
    const queue = document.querySelector(".case-queue")!.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll(".case-item")).map((card) =>
      card.getBoundingClientRect(),
    );
    const selected = document
      .querySelector(".case-item.is-selected")!
      .getBoundingClientRect();
    return {
      queueBottom: Math.round(queue.bottom),
      maxCardBottom: Math.round(Math.max(...cards.map((card) => card.bottom))),
      selectedBottom: Math.round(selected.bottom),
    };
  });

  expect(geometry.maxCardBottom).toBeLessThanOrEqual(geometry.queueBottom);
  expect(geometry.queueBottom - geometry.selectedBottom).toBeLessThanOrEqual(1);
});

test("keeps a larger case set searchable without shrinking cards", async ({ page }) => {
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    const emma = saved.reservations.find(
      (reservation: { id: string }) => reservation.id === "R-2048",
    );
    const extras = Array.from({ length: 8 }, (_, index) => ({
      ...emma,
      id: `R-30${String(index).padStart(2, "0")}`,
      guestDisplayName: `Additional Guest ${index + 1}`,
      label: "Needs review",
    }));
    localStorage.setItem(
      "teachback-demo-v1",
      JSON.stringify({ ...saved, reservations: [...saved.reservations, ...extras] }),
    );
  });
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });

  const rail = page.locator(".case-list");
  const railGeometry = await rail.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(railGeometry.scrollWidth).toBeGreaterThan(railGeometry.clientWidth);
  const nextCases = page.getByRole("button", { name: "Show more cases" });
  await expect(nextCases).toBeVisible();
  await nextCases.click();
  await expect.poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);

  const cardWidths = await page.locator(".case-item").evaluateAll((cards) =>
    cards.map((card) => Math.round(card.getBoundingClientRect().width)),
  );
  expect(Math.min(...cardWidths)).toBeGreaterThanOrEqual(240);

  await page.getByRole("searchbox", { name: "Search cases" }).fill("R-3007");
  await expect(page.locator(".case-item")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /R-3007\s+Additional Guest 8/ }))
    .toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Additional Guest 8" }),
  ).toBeVisible();
});

test("recovers safely from malformed saved state", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("teachback-demo-v1", JSON.stringify({ storageVersion: 1 }));
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Emma Wilson" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();
  const savedStateIsValid = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("teachback-demo-v1") ?? "null");
    return Array.isArray(saved?.reservations) && saved.reservations.length === 8;
  });
  expect(savedStateIsValid).toBe(true);
});

test("starts the new scenario with Sofia ready to teach", async ({ page }) => {
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
  await page.getByRole("button", { name: "Teach from this case" }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("button", { name: "Publish reusable rule" }).click();
  await expect(
    page.getByRole("button", { name: /R-2050\s+Sofia Rossi\s+Handled/ }),
  ).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem("teachback-teaching-scenario-version");
  });
  await page.reload();

  await expect(
    page.getByRole("button", { name: /R-2050\s+Sofia Rossi\s+Handled/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /R-2052\s+Daniel Kim\s+Unhandled/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /R-2050\s+Sofia Rossi/ }).click();
  await expect(page.getByRole("button", { name: "Teach from this case" }))
    .toBeVisible();
});

test("falls back safely from an invalid saved locale", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("teachback-ui-locale-v1", "unsupported");
  });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Cases" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "日本語" }),
  ).toBeVisible();
});

test("stays usable when saved-state writes are unavailable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Emma Wilson" })).toBeVisible();
  await page
    .getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    })
    .click();
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("keeps keyboard focus inside the audit dialog and restores it", async ({
  page,
}) => {
  const auditTrigger = page.getByRole("button", { name: "View audit trail" });
  await auditTrigger.focus();
  await auditTrigger.click();

  const closeButton = page.getByRole("button", { name: "Close audit trail" });
  await expect(closeButton).toBeFocused();
  await expect(
    page.getByText(
      "Records condition checks, approvals, applied changes, and stopped actions.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("Recorded actions", { exact: true }))
    .toBeVisible();
  await expect(page.locator(".app-content")).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Audit trail" })).toHaveCount(0);
  await expect(auditTrigger).toBeFocused();
});
