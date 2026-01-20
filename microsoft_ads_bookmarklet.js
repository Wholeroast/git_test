/* Microsoft Ads columns bookmarklet */
(function () {
  'use strict';

  const desiredColumns = [
    'daily budget',
    'status',
    'clicks',
    'impr.',
    'CTR',
    'CPC',
    'IMPR TOP %',
    'IMPR. ABS TOP',
    'cost',
    'conversions',
    'cost/conv. (cpa)',
    'conv.rate',
    'search impr. share',
    'LISR',
    'LISB',
    'bid strat',
    'bid strat type',
    'label',
    'target CPA',
  ];

  const logPrefix = '[ms-ads-columns]';

  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[%().]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const clickElement = (element) => {
    if (!element) return false;
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    element.click();
    return true;
  };

  const findColumnsButton = () => {
    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"]')
    );
    return (
      candidates.find((el) => /columns?/i.test(el.textContent || '')) ||
      candidates.find((el) => /columns?/i.test(el.getAttribute('aria-label') || ''))
    );
  };

  const waitForColumnsPanel = async (timeoutMs = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const panels = Array.from(
        document.querySelectorAll(
          '[role="dialog"], [data-testid*="column"], [data-test*="column"], .columns-panel, .column-panel'
        )
      );
      const panel = panels.find((el) => /column/i.test(el.textContent || ''));
      if (panel) return panel;
      await sleep(200);
    }
    return null;
  };

  const getCheckboxLabel = (checkbox, panel) => {
    const ariaLabel =
      checkbox.getAttribute('aria-label') || checkbox.getAttribute('title');
    if (ariaLabel) return ariaLabel.trim();

    if (checkbox.tagName === 'INPUT') {
      if (checkbox.id) {
        const label = panel.querySelector(`label[for="${checkbox.id}"]`);
        if (label) return label.textContent.trim();
      }
      const wrappedLabel = checkbox.closest('label');
      if (wrappedLabel) return wrappedLabel.textContent.trim();
    }

    const container =
      checkbox.closest('[role="option"], [role="listitem"], li, .column-item') ||
      checkbox.parentElement;
    return container ? container.textContent.trim() : '';
  };

  const buildCheckboxMap = (panel) => {
    const inputs = Array.from(panel.querySelectorAll('input[type="checkbox"]'));
    const ariaCheckboxes = Array.from(panel.querySelectorAll('[role="checkbox"]'));
    const allCheckboxes = [...inputs, ...ariaCheckboxes];
    const map = new Map();

    allCheckboxes.forEach((checkbox) => {
      const label = getCheckboxLabel(checkbox, panel);
      if (!label) return;
      const key = normalize(label);
      if (!map.has(key)) map.set(key, checkbox);
    });

    return map;
  };

  const applyColumnSelection = (panel) => {
    const map = buildCheckboxMap(panel);
    const missing = [];

    desiredColumns.forEach((label) => {
      const key = normalize(label);
      const checkbox = map.get(key);
      if (!checkbox) {
        missing.push(label);
        return;
      }

      const isChecked = checkbox.checked ?? checkbox.getAttribute('aria-checked') === 'true';
      if (!isChecked) clickElement(checkbox);
    });

    if (missing.length) {
      console.warn(`${logPrefix} Missing columns:`, missing);
    }
  };

  const findSelectedList = (panel) => {
    const labels = Array.from(
      panel.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"], label, span, div')
    );
    const selectedHeading = labels.find((el) =>
      /selected columns?/i.test(el.textContent || '')
    );
    if (selectedHeading) {
      const container =
        selectedHeading.closest('section, div, fieldset') ||
        selectedHeading.parentElement;
      if (container) {
        const list =
          container.querySelector('[role="listbox"], [role="list"], ul, ol');
        if (list) return list;
      }
    }

    const lists = Array.from(panel.querySelectorAll('[role="listbox"], [role="list"], ul, ol'));
    return lists.find((list) =>
      list.querySelector('[draggable="true"], [data-testid*="drag"], .drag-handle')
    );
  };

  const reorderSelectedColumns = (panel) => {
    const list = findSelectedList(panel);
    if (!list) return;

    const items = Array.from(
      list.querySelectorAll('[role="option"], [role="listitem"], li, .column-item')
    );
    if (!items.length) return;

    const itemMap = new Map(
      items.map((item) => [normalize(item.textContent || ''), item])
    );
    const matched = new Set();
    const fragment = document.createDocumentFragment();

    desiredColumns.forEach((label) => {
      const item = itemMap.get(normalize(label));
      if (item) {
        fragment.appendChild(item);
        matched.add(item);
      }
    });

    items.forEach((item) => {
      if (!matched.has(item)) fragment.appendChild(item);
    });

    list.appendChild(fragment);
  };

  const clickApply = (panel) => {
    const buttonTexts = ['apply', 'save', 'done', 'ok'];
    const buttons = Array.from(
      panel.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')
    );
    const button = buttons.find((el) =>
      buttonTexts.some((text) => (el.textContent || '').trim().toLowerCase() === text)
    );
    if (button) clickElement(button);
  };

  const run = async () => {
    window.__msAdsColumnBookmarkletConfig = desiredColumns.slice();

    const columnsButton = findColumnsButton();
    if (columnsButton) clickElement(columnsButton);

    const panel = await waitForColumnsPanel();
    if (!panel) {
      console.warn(`${logPrefix} Columns panel not found.`);
      return;
    }

    applyColumnSelection(panel);
    reorderSelectedColumns(panel);
    clickApply(panel);

    console.info(`${logPrefix} Applied columns order.`);
  };

  run();
})();
