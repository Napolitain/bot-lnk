import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingType, Technology } from '../../generated/proto/config.js';
import { researchTechnology, upgradeBuilding } from '../actions.js';
import { createMockPage } from './__fixtures__/mockPage.js';

// Mock dependencies
vi.mock('../popups.js', () => ({
  dismissPopups: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../gameHealth.js', () => ({
  checkGameHealth: vi.fn().mockResolvedValue({ healthy: true, issues: [] }),
  dismissIfOverlay: vi.fn().mockResolvedValue(true),
}));

vi.mock('../navigation.js', () => ({
  navigateToCastleLibrary: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../utils/index.js', () => ({
  saveDebugContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../config.js', () => ({
  config: {
    dryRun: false,
    maxBuildingQueue: 2,
    freeFinishThresholdMs: 300000,
  },
}));

describe('upgradeBuilding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully upgrades a building when button is enabled', async () => {
    const { page, clicks, evaluateCalls } = createMockPage({
      buildingButtonEnabled: true,
      buildingHasDisabledClass: false,
      buildingIsUpgrading: false,
      confirmDialogAppears: false,
    });

    const result = await upgradeBuilding(page, 0, BuildingType.KEEP);

    expect(result).toBe(true);

    // Should check for disabled class
    expect(evaluateCalls.some((s) => s.includes('button'))).toBe(true);

    // Should click the upgrade button
    expect(clicks.some((s) => s.includes('button.button--action'))).toBe(true);
  });

  it('returns false when button has disabled CSS class (insufficient resources)', async () => {
    const { page, clicks } = createMockPage({
      buildingButtonEnabled: true,
      buildingHasDisabledClass: true, // Failure point
    });

    const result = await upgradeBuilding(page, 0, BuildingType.FARM);

    expect(result).toBe(false);
    // Should not click anything
    expect(clicks).toHaveLength(0);
  });

  it('returns false when button is not enabled', async () => {
    const { page, clicks } = createMockPage({
      buildingButtonEnabled: false, // Failure point
      buildingHasDisabledClass: false,
    });

    const result = await upgradeBuilding(page, 0, BuildingType.ARSENAL);

    expect(result).toBe(false);
    expect(clicks).toHaveLength(0);
  });

  it('handles confirmation dialog when present', async () => {
    const { page, clicks } = createMockPage({
      buildingButtonEnabled: true,
      buildingHasDisabledClass: false,
      confirmDialogAppears: true, // Dialog appears
    });

    const result = await upgradeBuilding(page, 0, BuildingType.LIBRARY);

    expect(result).toBe(true);

    // Should click both upgrade button and confirm button
    expect(clicks.length).toBeGreaterThanOrEqual(2);
  });

  it('uses correct building index from BUILDING_TYPE_TO_INDEX', async () => {
    const { page, locators } = createMockPage({
      buildingButtonEnabled: true,
      buildingHasDisabledClass: false,
    });

    await upgradeBuilding(page, 0, BuildingType.KEEP);

    // Should construct selector with castle and building indices
    expect(
      locators.some((s) => s.includes('.table--global-overview--buildings')),
    ).toBe(true);
    expect(
      locators.some((s) => s.includes('.tabular-cell--upgrade-building')),
    ).toBe(true);
  });

  it('handles different castle indices correctly', async () => {
    const { page } = createMockPage({
      buildingButtonEnabled: true,
      buildingHasDisabledClass: false,
    });

    const result = await upgradeBuilding(page, 3, BuildingType.MARKET);

    expect(result).toBe(true);
  });

  it('returns false for unknown building type', async () => {
    const { page, clicks } = createMockPage({
      buildingButtonEnabled: true,
    });

    // Use BUILDING_UNKNOWN
    const result = await upgradeBuilding(
      page,
      0,
      BuildingType.BUILDING_UNKNOWN,
    );

    expect(result).toBe(false);
    expect(clicks).toHaveLength(0);
  });

  it('verifies building is upgrading after click (if not already upgrading)', async () => {
    const { page, evaluateCalls } = createMockPage({
      buildingButtonEnabled: true,
      buildingHasDisabledClass: false,
      buildingIsUpgrading: false, // Before click
    });

    await upgradeBuilding(page, 0, BuildingType.KEEP);

    // Should check upgrade status
    expect(evaluateCalls.length).toBeGreaterThan(0);
  });

  it('uses key CSS selectors (regression check)', async () => {
    const { page, locators } = createMockPage({
      buildingButtonEnabled: true,
      buildingHasDisabledClass: false,
    });

    await upgradeBuilding(page, 0, BuildingType.FARM);

    const criticalSelectors = [
      '.table--global-overview--buildings',
      '.tabular-row',
      '.tabular-cell--upgrade-building',
      'button.button--action',
    ];

    for (const selector of criticalSelectors) {
      expect(
        locators.some((s) => s.includes(selector)),
        `Expected to find selector: ${selector}`,
      ).toBe(true);
    }
  });
});

describe('researchTechnology', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully researches technology when visible', async () => {
    const { page, clicks } = createMockPage({
      technologyVisible: true,
      pageHealthy: true,
      libraryMenuOpensAfterClick: true,
      buildingSidebarVisible: true,
      initialView: 'library', // Already in library menu
    });

    const result = await researchTechnology(page, Technology.BEER_TESTER, 0);

    expect(result).toBe(true);

    // Should click the technology button (within techRow)
    expect(clicks.some((s) => s.includes('button.button'))).toBe(true);
  });

  it('returns false when navigation to library fails', async () => {
    const { navigateToCastleLibrary } = await import('../navigation.js');
    vi.mocked(navigateToCastleLibrary).mockResolvedValueOnce(false);

    const { page, clicks } = createMockPage({
      technologyVisible: true,
    });

    const result = await researchTechnology(page, Technology.BEER_TESTER, 0);

    expect(result).toBe(false);
    // Should not click technology if navigation failed
    expect(clicks.some((s) => s.includes('Beer tester'))).toBe(false);
  });

  it('returns false when technology not visible (already researched)', async () => {
    const { page, clicks } = createMockPage({
      technologyVisible: false, // Not visible
    });

    const result = await researchTechnology(page, Technology.CROSSBOW, 0);

    expect(result).toBe(false);
    expect(clicks).toHaveLength(0);
  });

  it('uses correct technology name from TECHNOLOGY_TO_NAME mapping', async () => {
    const { page, clicks, locators } = createMockPage({
      technologyVisible: true,
      libraryMenuOpensAfterClick: true,
      buildingSidebarVisible: true,
      initialView: 'library',
    });

    await researchTechnology(page, Technology.BEER_TESTER, 0);

    // Should filter by technology name from mapping
    expect(
      locators.some((s) => s.includes('filter(hasText:Beer tester)')),
    ).toBe(true);
  });

  it('handles different technologies correctly', async () => {
    const { page, locators } = createMockPage({
      technologyVisible: true,
      libraryMenuOpensAfterClick: true,
      buildingSidebarVisible: true,
      initialView: 'library',
    });

    await researchTechnology(page, Technology.LONGBOW, 0);

    expect(locators.some((s) => s.includes('filter(hasText:Longbow)'))).toBe(
      true,
    );
  });

  it('returns false for unknown technology', async () => {
    const { page, clicks } = createMockPage({
      technologyVisible: true,
    });

    const result = await researchTechnology(page, Technology.TECH_UNKNOWN, 0);

    expect(result).toBe(false);
    expect(clicks).toHaveLength(0);
  });

  it('passes correct castle index to navigation', async () => {
    const { navigateToCastleLibrary } = await import('../navigation.js');

    const { page } = createMockPage({
      technologyVisible: true,
    });

    await researchTechnology(page, Technology.BEER_TESTER, 2);

    // Should call navigateToCastleLibrary with castle index 2
    expect(navigateToCastleLibrary).toHaveBeenCalledWith(page, 2);
  });

  it('handles dry run mode correctly', async () => {
    const { config } = await import('../../config.js');
    vi.mocked(config).dryRun = true;

    const { page, clicks } = createMockPage({
      technologyVisible: true,
    });

    const result = await researchTechnology(page, Technology.BEER_TESTER, 0);

    expect(result).toBe(true);
    // Should not click in dry run mode
    expect(clicks).toHaveLength(0);

    // Reset
    vi.mocked(config).dryRun = false;
  });
});
