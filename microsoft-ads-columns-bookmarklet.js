/**
 * Microsoft Ads - configure visible columns (bookmarklet source).
 *
 * What it does:
 * - Opens the Columns configuration flyout (you must already be on it)
 * - Removes all currently selected columns (via "Remove all")
 * - Adds the desired columns in the exact order listed below
 *
 * Notes:
 * - Microsoft Ads column labels/case/punctuation can vary slightly by account/UI.
 *   This script matches column names "loosely" (case-insensitive, ignores punctuation).
 * - If a column cannot be found, it will be reported in the console and skipped.
 *
 * How to use:
 * - Convert this file to a bookmarklet by pasting the output of `makeBookmarklet()` into a bookmark URL,
 *   or copy/paste the IIFE content directly into a bookmarklet minifier of your choice.
 */

(function () {
  "use strict";

  // ---- Configuration ----

  /**
   * Columns requested by the user, in the exact order they must appear.
   * These are "friendly" names; matching is done loosely against UI labels.
   */
  const DESIRED_COLUMNS_IN_ORDER = [
    "Daily Budget",
    "Delivery",
    "Bid Strategy Type",
    "Bid Strategy",
    "Impr.",
    "Clicks",
    "CTR",
    "Avg CPC",
    "Spend",
    "Conv",
    "CPA",
    "Conv. Rate",
    "Revenue",
    "Impr Share",
    "IS Lost to rank",
    "IS lost to budget",
    "Top Impr Share",
    "Abs Top Impr Share",
    "Labels",
  ];

  /**
   * Category mapping from the user’s list.
   * Keys are the tab/category names in the UI.
   * Values are UI column labels as they typically appear under those categories.
   *
   * Matching is loose, so minor punctuation/case differences are OK.
   */
  const CATEGORY_TO_COLUMNS = {
    Attributes: [
      "Daily budget",
      "Delivery",
      "Bid strategy type",
      "Bid strategy",
      "Labels",
    ],
    Performance: ["Impr.", "Clicks", "CTR", "Avg. CPC", "Spend"],
    Conversions: ["CPA", "Conv.", "Conv. rate", "Revenue"],
    "Competitive (Share of Voice)": [
      "Impr. share",
      "IS lost to rank",
      "IS lost to budget",
      "Top impr. share",
      "Abs. top impr. share",
    ],
  };

  // Optional: aliases from requested name -> likely UI label(s)
  const COLUMN_ALIASES = {
    "Daily Budget": ["Daily budget"],
    "Bid Strategy Type": ["Bid strategy type"],
    "Bid Strategy": ["Bid strategy"],
    "Avg CPC": ["Avg. CPC", "Avg CPC"],
    Conv: ["Conv.", "Conv"],
    "Conv. Rate": ["Conv. rate", "Conv Rate", "Conv. Rate"],
    "Impr Share": ["Impr. share", "Impr share"],
    "IS Lost to rank": ["IS lost to rank", "IS Lost to rank", "IS lost to Rank"],
    "IS lost to budget": ["IS lost to budget", "IS Lost to budget", "IS lost to Budget"],
    "Top Impr Share": ["Top impr. share", "Top Impr. share", "Top impr share"],
    "Abs Top Impr Share": [
      "Abs. top impr. share",
      "Abs top impr. share",
      "Abs. top impr share",
    ],
  };

  // ---- Helpers ----

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalize = (s) =>
    String(s ?? "")
      .trim()
      .toLowerCase()
      // collapse whitespace
      .replace(/\s+/g, " ")
      // remove punctuation that commonly differs (periods, commas, colons, %)
      .replace(/[.,:%]/g, "")
      // remove extra parenthesis spacing noise
      .replace(/[()]/g, "");

  const equalsLoose = (a, b) => normalize(a) === normalize(b);

  const queryAll = (selector) => Array.from(document.querySelectorAll(selector));

  async function clickCategoryTabByName(categoryName) {
    const tabs = queryAll('li[role="tab"]');
    const wanted = normalize(categoryName);

    for (const tab of tabs) {
      const dataName = tab.getAttribute("data-category-name");
      const id = tab.id;
      const labelText = (tab.textContent || "").trim();

      const matches =
        (dataName && normalize(dataName) === wanted) ||
        (id && normalize(id) === wanted) ||
        (labelText && normalize(labelText) === wanted);

      if (!matches) continue;

      const isActive =
        tab.classList.contains("active") ||
        tab.getAttribute("aria-selected") === "true";

      if (!isActive) {
        (tab.querySelector("a") || tab).click();
        await sleep(500);
      }
      return true;
    }
    return false;
  }

  function getAllCategoryNames() {
    return queryAll('li[role="tab"][data-category-name]')
      .map((t) => t.getAttribute("data-category-name"))
      .filter(Boolean);
  }

  async function removeAllSelectedColumns() {
    const removeAllBtn = document.querySelector(
      "a.remove-all-in-selected-list"
    );
    if (removeAllBtn) {
      removeAllBtn.click();
      await sleep(600);
    }
  }

  function getSelectedColumnLabels() {
    return queryAll(".selected-item-name")
      .map((n) => (n.textContent || n.title || "").trim())
      .filter(Boolean);
  }

  function isColumnAlreadySelected(requestedName) {
    const selected = getSelectedColumnLabels();
    const candidates = [
      requestedName,
      ...(COLUMN_ALIASES[requestedName] || []),
    ];
    return selected.some((s) =>
      candidates.some((c) => equalsLoose(s, c))
    );
  }

  async function addColumnFromCurrentCategory(requestedName) {
    if (isColumnAlreadySelected(requestedName)) return true;

    const candidates = [
      requestedName,
      ...(COLUMN_ALIASES[requestedName] || []),
    ];

    // In the options list, each ".option" typically contains ".option-name" and ".add-column-link".
    for (const option of queryAll(".option")) {
      const nameEl = option.querySelector(".option-name");
      if (!nameEl) continue;

      const optionLabel = (nameEl.textContent || nameEl.title || "").trim();
      const matches = candidates.some((c) => equalsLoose(optionLabel, c));
      if (!matches) continue;

      const addLink = option.querySelector(".add-column-link");
      if (addLink) {
        addLink.click();
        await sleep(250);
        return true;
      }
    }

    return false;
  }

  async function findCategoryContainingColumn(requestedName) {
    const categories = getAllCategoryNames();
    const candidates = [
      requestedName,
      ...(COLUMN_ALIASES[requestedName] || []),
    ];

    for (const cat of categories) {
      await clickCategoryTabByName(cat);
      await sleep(300);

      // Look for an option with matching name in this category.
      const optionNames = queryAll(".option .option-name")
        .map((el) => (el.textContent || el.title || "").trim())
        .filter(Boolean);

      if (
        optionNames.some((opt) => candidates.some((c) => equalsLoose(opt, c)))
      ) {
        return cat;
      }
    }

    return null;
  }

  function guessCategoryForColumn(requestedName) {
    // Prefer the explicit mapping, using loose matching against known UI labels in each category.
    for (const [category, labels] of Object.entries(CATEGORY_TO_COLUMNS)) {
      for (const label of labels) {
        if (equalsLoose(requestedName, label)) return category;
      }
    }

    // Try aliases, too.
    const aliases = COLUMN_ALIASES[requestedName] || [];
    for (const alias of aliases) {
      for (const [category, labels] of Object.entries(CATEGORY_TO_COLUMNS)) {
        if (labels.some((label) => equalsLoose(alias, label))) return category;
      }
    }

    return null;
  }

  async function applyDesiredColumnsInOrder() {
    await removeAllSelectedColumns();
    await sleep(500);

    const missing = [];

    for (const col of DESIRED_COLUMNS_IN_ORDER) {
      let added = false;

      // 1) Use user-provided category mapping first (fast and stable).
      const preferredCategory = guessCategoryForColumn(col);
      if (preferredCategory) {
        await clickCategoryTabByName(preferredCategory);
        await sleep(250);
        added = await addColumnFromCurrentCategory(col);
      }

      // 2) If not found there, scan categories to find it.
      if (!added) {
        const foundCat = await findCategoryContainingColumn(col);
        if (foundCat) {
          await clickCategoryTabByName(foundCat);
          await sleep(250);
          added = await addColumnFromCurrentCategory(col);
        }
      }

      if (!added) missing.push(col);
      await sleep(120);
    }

    if (missing.length) {
      console.warn(
        "[Microsoft Ads Columns] Could not find/add columns:",
        missing
      );
    } else {
      console.log("[Microsoft Ads Columns] All desired columns added.");
    }
  }

  // Run immediately (bookmarklet behavior).
  applyDesiredColumnsInOrder().catch((err) => {
    console.error("[Microsoft Ads Columns] Failed:", err);
  });
})();

