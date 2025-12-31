import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  navigateToCastleKeep,
  navigateToCastleLibrary,
  navigateToCastleTavern,
} from '../navigation.js';
import { createMockPage } from './__fixtures__/mockPage.js';

// Mock dependencies
vi.mock('../popups.js', () => ({
  dismissPopups: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/index.js', () => ({
  pollUntil: vi.fn(async (fn, _options) => {
    // Simulate polling by calling the function multiple times
    // This allows state changes from clicks to take effect
    let result = await fn();
    if (!result) {
      // Try again (simulating one retry)
      await new Promise((resolve) => setTimeout(resolve, 10));
      result = await fn();
    }
    return result;
  }),
  saveDebugContext: vi.fn().mockResolvedValue(undefined),
}));

/**
 * CRITICAL NAVIGATION BEHAVIOR:
 *
 * All per-castle building menus (Library, Keep, Tavern) MUST use the same path:
 * 1. Click "Buildings" button (top menu)
 * 2. Click building name in #menu-section-general-container sidebar
 * 3. Wait for building-specific menu to open
 *
 * This is simpler and more reliable than the table-based approach.
 * These tests ensure we maintain this behavior.
 */

describe('navigateToCastleLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true immediately if already in library menu', async () => {
    const { page, clicks } = createMockPage({
      initialView: 'library',
    });

    const result = await navigateToCastleLibrary(page, 0);

    expect(result).toBe(true);
    // Should not click anything - early exit
    expect(clicks).toHaveLength(0);
  });

  it('navigates using Buildings button → Library in sidebar', async () => {
    const { page, clicks, texts } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      libraryMenuOpensAfterClick: true,
    });

    const result = await navigateToCastleLibrary(page, 0);

    expect(result).toBe(true);

    // CRITICAL: Must use Buildings button, not global table
    expect(texts).toContain('Buildings');

    // CRITICAL: Must use sidebar container
    expect(texts).toContain('Library');

    // Should have 2 clicks: Buildings button + Library button
    expect(clicks.length).toBeGreaterThanOrEqual(2);
  });

  it('returns false when Library button not found in sidebar', async () => {
    const { page } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: false, // Library button not visible
    });

    const result = await navigateToCastleLibrary(page, 0);

    expect(result).toBe(false);
  });

  it('returns false when library menu fails to open after click', async () => {
    const { page } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      libraryMenuOpensAfterClick: false, // Failure point
      pollUntilSuccess: false,
    });

    const result = await navigateToCastleLibrary(page, 0);

    expect(result).toBe(false);
  });

  it('uses stable selectors (regression check)', async () => {
    const { page, texts, locators } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      libraryMenuOpensAfterClick: true,
    });

    await navigateToCastleLibrary(page, 0);

    // CRITICAL: Must use these exact patterns (Playwright recording verified)
    expect(texts).toContain('Buildings'); // Top menu button
    expect(texts).toContain('Library'); // Sidebar button
    expect(
      locators.some((s) => s.includes('#menu-section-general-container')),
    ).toBe(true);
  });

  it('CRITICAL: does NOT use global table path (regression)', async () => {
    const { page, locators } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      libraryMenuOpensAfterClick: true,
    });

    await navigateToCastleLibrary(page, 0);

    // MUST NOT use old table-based selectors
    expect(
      locators.some((s) => s.includes('.table--global-overview--buildings')),
    ).toBe(false);
    expect(
      locators.some((s) => s.includes('.tabular-cell--upgrade-building')),
    ).toBe(false);
    expect(locators.some((s) => s.includes('.icon-building--library'))).toBe(
      false,
    );

    // MUST use new sidebar-based approach
    expect(
      locators.some((s) => s.includes('#menu-section-general-container')),
    ).toBe(true);
  });
});

describe('navigateToCastleKeep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses same path as Library: Buildings button → Keep in sidebar', async () => {
    const { page, texts, locators } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      keepMenuOpensAfterClick: true,
    });

    const result = await navigateToCastleKeep(page, 0);

    expect(result).toBe(true);

    // CRITICAL: Must match Library navigation pattern
    expect(texts).toContain('Buildings');
    expect(texts).toContain('Keep');
    expect(
      locators.some((s) => s.includes('#menu-section-general-container')),
    ).toBe(true);
  });

  it('CRITICAL: does NOT use global table path (regression)', async () => {
    const { page, locators } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      keepMenuOpensAfterClick: true,
    });

    await navigateToCastleKeep(page, 0);

    // MUST NOT use old table-based approach
    expect(
      locators.some((s) => s.includes('.table--global-overview--buildings')),
    ).toBe(false);
    expect(locators.some((s) => s.includes('.icon-building--keep'))).toBe(
      false,
    );
  });
});

describe('navigateToCastleTavern', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses same path as Library: Buildings button → Tavern in sidebar', async () => {
    const { page, texts, locators } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      tavernMenuOpensAfterClick: true,
    });

    const result = await navigateToCastleTavern(page, 0);

    expect(result).toBe(true);

    // CRITICAL: Must match Library navigation pattern
    expect(texts).toContain('Buildings');
    expect(texts).toContain('Tavern');
    expect(
      locators.some((s) => s.includes('#menu-section-general-container')),
    ).toBe(true);
  });

  it('CRITICAL: does NOT use global table path (regression)', async () => {
    const { page, locators } = createMockPage({
      initialView: 'none',
      buildingSidebarVisible: true,
      tavernMenuOpensAfterClick: true,
    });

    await navigateToCastleTavern(page, 0);

    // MUST NOT use old table-based approach
    expect(
      locators.some((s) => s.includes('.table--global-overview--buildings')),
    ).toBe(false);
    expect(locators.some((s) => s.includes('.icon-building--tavern'))).toBe(
      false,
    );
  });
});

describe('CRITICAL: All per-castle buildings use consistent navigation', () => {
  it('Library, Keep, and Tavern all use Buildings button approach', async () => {
    const configs = [
      {
        name: 'Library',
        fn: navigateToCastleLibrary,
        opens: 'libraryMenuOpensAfterClick',
      },
      {
        name: 'Keep',
        fn: navigateToCastleKeep,
        opens: 'keepMenuOpensAfterClick',
      },
      {
        name: 'Tavern',
        fn: navigateToCastleTavern,
        opens: 'tavernMenuOpensAfterClick',
      },
    ];

    for (const { name, fn, opens } of configs) {
      const { page, texts, locators } = createMockPage({
        initialView: 'none',
        buildingSidebarVisible: true,
        [opens]: true,
      });

      await fn(page, 0);

      // All must use same pattern
      expect(texts, `${name} should use Buildings button`).toContain(
        'Buildings',
      );
      expect(texts, `${name} should use sidebar button`).toContain(name);
      expect(
        locators.some((s) => s.includes('#menu-section-general-container')),
        `${name} should use sidebar container`,
      ).toBe(true);

      // None should use old table approach
      expect(
        locators.some((s) => s.includes('.table--global-overview--buildings')),
        `${name} should NOT use global table`,
      ).toBe(false);
    }
  });
});
