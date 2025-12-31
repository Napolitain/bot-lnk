# Browser Action Tests

Mock-based unit tests for browser navigation and action flows.

## Test Coverage

### Navigation Tests (`navigation.test.ts`)
Tests for `navigateToCastleLibrary()`:
- ✅ Early exit when already in library menu
- ✅ Failure when castle row not visible
- ✅ Failure when library building not found
- ✅ Failure when library menu doesn't open
- ✅ Selector stability (regression detection)
- ✅ Correct castle index handling
- ⏭️ Full happy path (skipped - mock complexity)

### Action Tests (`actions.test.ts`)

#### Building Upgrade Tests
Tests for `upgradeBuilding()`:
- ✅ Successful upgrade when button enabled
- ✅ Failure when button has disabled CSS class (insufficient resources)
- ✅ Failure when button not enabled
- ✅ Confirmation dialog handling
- ✅ Correct building type index mapping
- ✅ Multiple castle indices
- ✅ Unknown building type rejection
- ✅ Upgrade verification after click
- ✅ Selector stability check

#### Research Technology Tests  
Tests for `researchTechnology()`:
- ✅ Successful research when technology visible
- ✅ Failure when navigation to library fails
- ✅ Failure when technology not visible (already researched)
- ✅ Correct technology name mapping
- ✅ Different technologies
- ✅ Unknown technology rejection
- ✅ Castle index passed to navigation
- ✅ Dry run mode

## Test Philosophy

**Flexible validation, not strict mocking:**
- Tests verify **critical selectors are used** (prevents typos)
- Tests verify **key actions happen** (clicks, state changes)
- Tests do NOT enforce exact call sequences (allows refactoring)
- Tests do NOT mock every detail (avoids brittleness)

## Mock Page Helper

`__fixtures__/mockPage.ts` provides:
- Configurable Playwright Page mock
- Tracks clicks and locators used
- Simulates state changes after clicks
- Returns flexible locator chains

### Usage Example

```typescript
const { page, clicks, locators } = createMockPage({
  buildingButtonEnabled: true,
  buildingHasDisabledClass: false,
});

const result = await upgradeBuilding(page, 0, BuildingType.KEEP);

expect(result).toBe(true);
expect(clicks).toContain('button.button--action');
```

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific file
npm test src/browser/__tests__/navigation.test.ts
```

## When Tests Fail

### ✅ Expected Failures (Fix the code):
- Selector changed unintentionally (typo)
- Logic flow broken (missing step)
- Return value contract changed

### 🔄 Expected Updates (Update the test):
- Intentional refactoring
- Game UI changes (legitimate selector updates)
- New edge cases discovered

## Future Improvements

1. **Fix skipped happy path test** - Improve mock to handle multi-step state changes
2. **Add recruitment tests** - Test `recruitUnit()` flow
3. **Add trading tests** - Test trading dialog interactions
4. **Snapshot tests** - Add selector snapshot tests for regression detection
5. **Integration tests** - Use real Playwright with HTML fixtures
