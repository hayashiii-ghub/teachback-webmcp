import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset demo" }).click();
});

test("prepares, approves, and keeps commit bound to the agent tool", async ({ page }) => {
  await expect(
    page.getByText("Show once. Set the boundaries. Reuse safely.", {
      exact: true,
    }),
  ).toHaveCount(0);
  const flow = page.getByRole("region", { name: "How Teachback reuses work" });
  await expect(flow.getByText("1 · Taught from")).toBeVisible();
  await expect(flow.getByText("R-2041 · Aiko Tanaka")).toBeVisible();
  await expect(flow.getByText("Late Arrival Care")).toBeVisible();
  await expect(flow.getByText("R-2048 · Emma Wilson")).toBeVisible();
  await expect(page.getByText("Not checked yet", { exact: true })).toBeVisible();
  await expect(page.locator(".eligibility-list .check-icon")).toHaveCount(0);
  await expect(
    page.getByText("Not available in this browser", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    })
    .click();
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();
  await expect(page.getByText("No changes have been applied.")).toBeVisible();
  await expect(page.getByText("Eligible", { exact: true })).toBeVisible();
  await expect(page.locator(".eligibility-list .check-icon")).toHaveCount(7);

  await page.getByRole("button", { name: "Approve preview" }).click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready to commit", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Open this page in a WebMCP-enabled browser to commit it.",
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
  const flow = page.getByRole("region", { name: "Teachbackの流れ" });
  await expect(flow.getByText("1 · 教えた対応")).toBeVisible();
  await expect(flow.getByText("3 · この予約で再利用")).toBeVisible();
  await expect(page.getByText("Built in Japan", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("Built in Japan", { exact: true }))
    .toHaveAttribute("lang", "en");
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

test("refuses the unsafe case without changing it", async ({ page }) => {
  await page.getByRole("button", { name: /R-2052\s+Daniel Kim/ }).click();
  await page
    .getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    })
    .click();

  await expect(page.getByRole("heading", { name: "Human review required" })).toBeVisible();
  await expect(page.getByText("Not eligible", { exact: true })).toBeVisible();
  await expect(page.locator(".eligibility-list li.is-failed")).toHaveCount(3);
  await expect(page.locator(".eligibility-list li.is-passed")).toHaveCount(4);
  await expect(page.getByText("Arrival is later than 22:00.")).toBeVisible();
  await expect(
    page.getByText("No changes were made.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve preview" })).toHaveCount(0);
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
  await expect(flow.getByText("R-2041 · Aiko Tanaka")).toBeVisible();
  await expect(flow.getByText("R-2052 · Daniel Kim")).toHaveCount(0);
});

test("treats the recorded reservation as the teaching source", async ({ page }) => {
  await page.getByRole("button", { name: /R-2041\s+Aiko Tanaka/ }).click();

  await expect(
    page.getByRole("heading", { name: "The playbook was taught here" }),
  ).toBeVisible();
  await expect(page.getByText("Teaching source", { exact: true })).toHaveCount(2);
  await expect(
    page.getByRole("button", {
      name: "Check conditions and prepare preview",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "How Teachback reuses work" })
      .getByText("3 · Viewing the taught case"),
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
  await expect(page.getByText("Eligible", { exact: true })).toBeVisible();

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

test("reports WebMCP readiness without persisting UI status", async ({ page }) => {
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

  await expect(page.getByText("Available · 3 tools", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const testWindow = window as Window & { registeredTeachbackTools?: string[] };
    return testWindow.registeredTeachbackTools;
  })).toEqual([
    "teachback_get_current_case",
    "teachback_prepare_current",
    "teachback_commit_approved",
  ]);

  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.getByText("利用可能 · 3ツール", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const testWindow = window as Window & { registeredTeachbackTools?: string[] };
    return testWindow.registeredTeachbackTools?.length;
  })).toBe(3);

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

  await expect(page.getByText("Registration failed", { exact: true })).toBeVisible();
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
  expect(wideTablet.header.height).toBe(88);
  expect(wideTablet.cases).toMatchObject({ x: 0, width: 1024 });
  expect(wideTablet.main.x).toBe(0);
  expect(wideTablet.main.y).toBe(wideTablet.review.y);
  expect(wideTablet.main.x + wideTablet.main.width).toBe(wideTablet.review.x);
  expect(wideTablet.review.width).toBeGreaterThanOrEqual(320);

  for (const width of [1023, 900, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const stackedTablet = await readLayout();
    expect(stackedTablet.header.height, `header at ${width}px`).toBe(88);
    expect(stackedTablet.cases, `cases at ${width}px`).toMatchObject({
      x: 0,
      width,
    });
    expect(stackedTablet.main, `main at ${width}px`).toMatchObject({
      x: 0,
      width,
    });
    expect(stackedTablet.review, `review at ${width}px`).toMatchObject({
      x: 0,
      width,
    });
    expect(stackedTablet.review.y).toBe(
      stackedTablet.main.y + stackedTablet.main.height,
    );
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  const desktop = await readLayout();
  expect(desktop.cases.y).toBe(desktop.main.y);
  expect(desktop.main.y).toBe(desktop.review.y);
  expect(desktop.cases.x + desktop.cases.width).toBe(desktop.main.x);
  expect(desktop.main.x + desktop.main.width).toBe(desktop.review.x);
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
    return Array.isArray(saved?.reservations) && saved.reservations.length === 3;
  });
  expect(savedStateIsValid).toBe(true);
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
  await expect(page.locator(".app-content")).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Audit trail" })).toHaveCount(0);
  await expect(auditTrigger).toBeFocused();
});
