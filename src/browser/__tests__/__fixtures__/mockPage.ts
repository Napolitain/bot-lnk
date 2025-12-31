import type { Page } from 'playwright';

export interface MockPageConfig {
  // View state
  initialView?: 'buildings' | 'library' | 'keep' | 'tavern' | 'none';
  
  // Navigation success flags (new sidebar approach)
  buildingSidebarVisible?: boolean;
  libraryMenuOpensAfterClick?: boolean;
  keepMenuOpensAfterClick?: boolean;
  tavernMenuOpensAfterClick?: boolean;
  
  // Legacy navigation (table-based - deprecated)
  castleRowVisible?: boolean;
  libraryBuildingVisible?: boolean;
  buildingMenuOpensAfterClick?: boolean;
  
  // Building upgrade specific
  buildingButtonEnabled?: boolean;
  buildingHasDisabledClass?: boolean;
  buildingIsUpgrading?: boolean;
  confirmDialogAppears?: boolean;
  
  // Technology specific
  technologyVisible?: boolean;
  
  // Health check
  pageHealthy?: boolean;
  
  // PollUntil behavior
  pollUntilSuccess?: boolean;
}

export interface MockPageResult {
  page: Page;
  clicks: string[];
  locators: string[];
  texts: string[]; // Track getByText calls
  evaluateCalls: string[];
}

/**
 * Create a flexible mock Page object that tracks interactions
 * without enforcing strict call sequences.
 */
export function createMockPage(config: MockPageConfig = {}): MockPageResult {
  const clicks: string[] = [];
  const locators: string[] = [];
  const texts: string[] = [];
  const evaluateCalls: string[] = [];
  
  // Default config
  const cfg = {
    initialView: config.initialView ?? 'none',
    buildingSidebarVisible: config.buildingSidebarVisible ?? true,
    libraryMenuOpensAfterClick: config.libraryMenuOpensAfterClick ?? true,
    keepMenuOpensAfterClick: config.keepMenuOpensAfterClick ?? true,
    tavernMenuOpensAfterClick: config.tavernMenuOpensAfterClick ?? true,
    castleRowVisible: config.castleRowVisible ?? true,
    libraryBuildingVisible: config.libraryBuildingVisible ?? true,
    buildingMenuOpensAfterClick: config.buildingMenuOpensAfterClick ?? true,
    buildingButtonEnabled: config.buildingButtonEnabled ?? true,
    buildingHasDisabledClass: config.buildingHasDisabledClass ?? false,
    buildingIsUpgrading: config.buildingIsUpgrading ?? false,
    confirmDialogAppears: config.confirmDialogAppears ?? false,
    technologyVisible: config.technologyVisible ?? true,
    pageHealthy: config.pageHealthy ?? true,
    pollUntilSuccess: config.pollUntilSuccess ?? true,
  };
  
  let libraryMenuOpen = cfg.initialView === 'library';
  let keepMenuOpen = cfg.initialView === 'keep';
  let tavernMenuOpen = cfg.initialView === 'tavern';
  let buildingMenuOpen = false;
  
  function createLocatorMock(selector: string, options: {
    visible?: boolean;
    enabled?: boolean;
    textContent?: string;
    count?: number;
  } = {}): any {
    locators.push(selector);
    
    const mock = {
      locator: (subSelector: string) => {
        return createLocatorMock(subSelector, options);
      },
      
      getByText: (text: string, opts: { exact?: boolean } = {}) => {
        texts.push(text);
        // Create a combined selector showing the chain
        const combined = `${selector} > text="${text}"`;
        const textMock = createLocatorMock(combined, options);
        
        // Override click to handle state changes
        const originalClick = textMock.click;
        textMock.click = async () => {
          clicks.push(combined);
          if (text === 'Library' && cfg.libraryMenuOpensAfterClick) {
            libraryMenuOpen = true;
          }
          if (text === 'Keep' && cfg.keepMenuOpensAfterClick) {
            keepMenuOpen = true;
          }
          if (text === 'Tavern' && cfg.tavernMenuOpensAfterClick) {
            tavernMenuOpen = true;
          }
        };
        
        return textMock;
      },
      
      nth: (index: number) => createLocatorMock(`${selector}[${index}]`, options),
      
      first: () => createLocatorMock(`${selector}.first()`, options),
      
      filter: ({ has, hasText }: any) => {
        const filterDesc = has ? ` with child` : `filter(hasText:${hasText})`;
        // For library row, this is filtering by icon-building--library child
        const filtered = createLocatorMock(`${selector}${filterDesc}`, {
          ...options,
          visible: has && selector.includes('.menu-list-element-basic') 
            ? (cfg.libraryBuildingVisible && buildingMenuOpen)
            : options.visible,
        });
        return filtered;
      },
      
      click: async () => {
        clicks.push(selector);
        
        // Simulate state changes after clicks
        if (selector.includes('.tabular-cell--upgrade-building') && !buildingMenuOpen) {
          // Clicking castle row opens building menu (legacy path)
          buildingMenuOpen = cfg.buildingMenuOpensAfterClick;
        }
        if (selector.includes('text="Buildings"') || selector.includes('Buildings')) {
          // Clicking Buildings button (always successful)
          // No state change needed - sidebar is always available
        }
        if (selector.includes('text="Library"') || selector.includes('Library')) {
          // Clicking Library in sidebar
          if (cfg.libraryMenuOpensAfterClick) {
            libraryMenuOpen = true;
          }
        }
        if (selector.includes('text="Keep"') || selector.includes('Keep')) {
          // Clicking Keep in sidebar
          if (cfg.keepMenuOpensAfterClick) {
            keepMenuOpen = true;
          }
        }
        if (selector.includes('text="Tavern"') || selector.includes('Tavern')) {
          // Clicking Tavern in sidebar
          if (cfg.tavernMenuOpensAfterClick) {
            tavernMenuOpen = true;
          }
        }
        // Legacy: clicking building icons
        if (selector.includes('.icon-building--library') && buildingMenuOpen) {
          if (cfg.libraryMenuOpensAfterClick) {
            libraryMenuOpen = true;
          }
        }
      },
      
      isVisible: async ({ timeout }: { timeout?: number } = {}) => {
        // Determine visibility based on selector patterns
        if (selector.includes('.table--global-overview--buildings')) {
          return cfg.initialView === 'buildings';
        }
        if (selector.includes('#menu-section-general-container')) {
          return cfg.buildingSidebarVisible;
        }
        if (selector.includes('text="Buildings"') || (selector.includes('Buildings') && !selector.includes('table'))) {
          return true; // Buildings button always visible
        }
        if (selector.includes('text="Library"') && selector.includes('#menu-section-general-container')) {
          return cfg.buildingSidebarVisible;
        }
        if (selector.includes('text="Keep"') && selector.includes('#menu-section-general-container')) {
          return cfg.buildingSidebarVisible;
        }
        if (selector.includes('text="Tavern"') && selector.includes('#menu-section-general-container')) {
          return cfg.buildingSidebarVisible;
        }
        if (selector.includes('.menu-list-title-basic') || selector.includes('.menu-list-element-basic')) {
          return libraryMenuOpen || keepMenuOpen || tavernMenuOpen;
        }
        if (selector.includes('.icon-building--keep')) {
          return buildingMenuOpen || keepMenuOpen;
        }
        if (selector.includes('.tabular-cell--upgrade-building')) {
          return cfg.castleRowVisible;
        }
        if (selector.includes('.icon-building--library')) {
          return cfg.libraryBuildingVisible && buildingMenuOpen;
        }
        if (selector.includes('.menu-list-element-basic.clickable') && selector.includes('filter')) {
          // This is the library row filter - should be visible if building menu is open
          return cfg.libraryBuildingVisible && buildingMenuOpen;
        }
        if (selector.includes('button.button--action')) {
          return cfg.buildingButtonEnabled;
        }
        if (selector.includes('.dialog')) {
          return cfg.confirmDialogAppears;
        }
        if (selector.includes('text=')) {
          // Technology button
          return cfg.technologyVisible;
        }
        if (selector.includes('button.button--in-building-list--trade')) {
          return keepMenuOpen;
        }
        
        return options.visible ?? true;
      },
      
      isEnabled: async () => {
        if (selector.includes('button')) {
          return cfg.buildingButtonEnabled;
        }
        return options.enabled ?? true;
      },
      
      textContent: async () => {
        return options.textContent ?? '100';
      },
      
      count: async () => {
        if (selector.includes('.upgrade-building--cell')) {
          // Multiple cells means upgrading
          return cfg.buildingIsUpgrading ? 2 : 1;
        }
        if (selector.includes('.dialog')) {
          return cfg.confirmDialogAppears ? 1 : 0;
        }
        return options.count ?? 1;
      },
      
      evaluate: async (fn: any) => {
        evaluateCalls.push(selector);
        
        // Mock classList.contains('disabled')
        if (selector.includes('button')) {
          return cfg.buildingHasDisabledClass;
        }
        
        return false;
      },
      
      waitForTimeout: async (ms: number) => {
        // No-op in tests
      },
      
      catch: (handler: any) => mock,
    };
    
    return mock;
  }
  
  const page = {
    locator: (selector: string) => createLocatorMock(selector),
    
    getByRole: (role: string, { name }: { name: string }) => {
      return createLocatorMock(`role=${role}[name="${name}"]`);
    },
    
    getByText: (text: string, { exact }: { exact?: boolean } = {}) => {
      texts.push(text); // Track getByText calls
      
      // Return a locator mock that knows about the text
      const textLocator = createLocatorMock(`text="${text}"`);
      
      // Override click to handle text-based navigation
      const originalClick = textLocator.click;
      textLocator.click = async () => {
        clicks.push(`text="${text}"`);
        if (text === 'Library' && cfg.libraryMenuOpensAfterClick) {
          libraryMenuOpen = true;
        }
        if (text === 'Keep' && cfg.keepMenuOpensAfterClick) {
          keepMenuOpen = true;
        }
        if (text === 'Tavern' && cfg.tavernMenuOpensAfterClick) {
          tavernMenuOpen = true;
        }
      };
      
      return textLocator;
    },
    
    waitForTimeout: async (ms: number) => {
      // No-op
    },
    
    url: () => 'https://lordsandknights.com/game',
  } as unknown as Page;
  
  return { page, clicks, locators, texts, evaluateCalls };
}
