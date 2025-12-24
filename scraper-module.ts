import { chromium, Browser, Page, ElementHandle } from 'playwright';

export interface PlaceDetails {
  name: string | null;
  url: string;
  address: string | null;
  placeId: string | null;
}

export interface ProgressUpdate {
  current: number;
  total: number;
  message: string;
  status?: 'running' | 'completed' | 'error';
  results?: PlaceDetails[];
  error?: string;
}

export async function scrapeGoogleMapsList(
  listUrl: string,
  maxItems: number,
  onProgress: (update: ProgressUpdate) => void
): Promise<PlaceDetails[]> {
  let browser: Browser | undefined;
  let page: Page | undefined;
  const results: PlaceDetails[] = [];
  const urlsSeen: Set<string> = new Set();

  try {
    onProgress({ current: 0, total: maxItems, message: '🚀 Launching browser...' });
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    page = await browser.newPage();
    
    // Set longer timeouts for deployed environments
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    onProgress({ current: 0, total: maxItems, message: '🌍 Navigating to Google Maps list...' });
    await page.goto(listUrl, { waitUntil: 'domcontentloaded' });

    // Helper functions (same as original)
    async function closeAnyDialog(): Promise<void> {
      if (!page) return;
      await page.waitForTimeout(250);
      for (let attempt = 0; attempt < 3; attempt++) {
        let closedSomething = false;
        try {
          const cancelBtn = page.locator('button[aria-label="Cancel"]');
          if (await cancelBtn.isVisible({ timeout: 500 })) {
            await cancelBtn.click();
            await page.waitForTimeout(100);
            closedSomething = true;
          }
        } catch {}
        try {
          const closeBtn = page.locator('button[aria-label="Close"]');
          if (await closeBtn.isVisible({ timeout: 500 })) {
            await closeBtn.click();
            await page.waitForTimeout(100);
            closedSomething = true;
          }
        } catch {}
        try {
          const noThanksBtn = page.locator('button:has-text("No thanks"), button:has-text("Dismiss"), button:has-text("Not now")');
          if (await noThanksBtn.first().isVisible({ timeout: 500 })) {
            await noThanksBtn.first().click();
            await page.waitForTimeout(100);
            closedSomething = true;
          }
        } catch {}
        try {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(100);
        } catch {}
        if (!closedSomething) break;
      }
    }

    async function getListItemByIndex(index: number): Promise<ElementHandle | null> {
      if (!page) return null;
      try {
        const element = await page.evaluateHandle((idx: number) => {
          const sidebar = document.querySelector('[role="main"]');
          if (!sidebar) return null;
          const candidates = sidebar.querySelectorAll('a, [role="button"], [jsaction]');
          const placeItems = Array.from(candidates).filter((el: Element) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const text = el.textContent || '';
            if (text.trim().length < 10) return false;
            if (text.match(/^(Overview|Reviews|Photos|About)$/)) return false;
            if (text.match(/^(Share|Save|Directions|Nearby)$/)) return false;
            const parent = el.closest('[role="main"]');
            if (!parent) return false;
            if (text.match(/\d\.\d.*\([\d,]+\)/)) return true;
            if (text.match(/\d\.\d.*\(/)) return true;
            if (text.match(/[A-Z][a-z]+/) && text.includes('★')) return true;
            const hasCapitalizedWords = text.match(/[A-Z][a-z]+/);
            const wordCount = text.trim().split(/\s+/).length;
            const hasSubstantialContent = text.trim().length >= 15;
            if (hasCapitalizedWords && (wordCount >= 2 || hasSubstantialContent)) {
              const isNotJustNumbers = !text.match(/^\d+[\s\d,.-]*$/);
              const isNotJustDate = !text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/);
              if (isNotJustNumbers && isNotJustDate) return true;
            }
            return false;
          });
          return placeItems[idx] || null;
        }, index);
        return element.asElement();
      } catch (e) {
        return null;
      }
    }

    async function scrollListDown(): Promise<void> {
      if (!page) return;
      try {
        await page.evaluate(() => {
          const sidebar = document.querySelector('[role="main"]');
          if (!sidebar) return;
          const scrollElement = sidebar.querySelector('[role="feed"]') || sidebar;
          scrollElement.scrollTop += 300;
        });
        await page.waitForTimeout(200);
      } catch (e) {}
    }

    async function clickListItem(item: ElementHandle): Promise<void> {
      if (!page) return;
      try {
        await closeAnyDialog();
        await item.click();
        await page.waitForTimeout(400);
      } catch (e) {
        throw e;
      }
    }

    async function extractPlaceDetails(): Promise<PlaceDetails> {
      if (!page) throw new Error('Page not initialized');
      try {
        await page.waitForTimeout(300);
        const details: PlaceDetails = {
          name: null,
          url: page.url(),
          address: null,
          placeId: null
        };
        const urlMatch = details.url.match(/!1s(0x[a-f0-9:]+)/);
        if (urlMatch) details.placeId = urlMatch[1];
        try {
          const urlNameMatch = details.url.match(/\/place\/([^/@]+)/);
          if (urlNameMatch) {
            details.name = decodeURIComponent(urlNameMatch[1].replace(/\+/g, ' '));
          }
          if (!details.name || details.name === 'Want to go') {
            const h1Elements = await page.locator('h1').all();
            for (const h1 of h1Elements) {
              const text = await h1.textContent();
              if (text && text !== 'Want to go' && text.trim().length > 0) {
                details.name = text;
                break;
              }
            }
          }
          if (!details.name || details.name === 'Want to go') {
            const nameBtn = await page.locator('[aria-label*="Save"][aria-label*="to"]').first();
            if (await nameBtn.isVisible({ timeout: 400 })) {
              const ariaLabel = await nameBtn.getAttribute('aria-label');
              const match = ariaLabel?.match(/Save (.+?) to/);
              if (match) details.name = match[1];
            }
          }
        } catch (e) {}
        try {
          const addressButton = page.locator('button[data-item-id="address"]');
          if (await addressButton.isVisible({ timeout: 800 })) {
            const addressDiv = addressButton.locator('div[class*="fontBodyMedium"]').first();
            details.address = await addressDiv.textContent();
          }
        } catch (e) {}
        return details;
      } catch (e) {
        throw e;
      }
    }

    onProgress({ current: 0, total: maxItems, message: '⏳ Waiting for sidebar to load...' });
    await page.waitForSelector('[role="main"]', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await closeAnyDialog();
    await page.waitForTimeout(200);
    await closeAnyDialog();

    // Count actual items in the list
    onProgress({ current: 0, total: maxItems, message: '🔍 Detecting number of items in list...' });
    async function countAllItems(): Promise<number> {
      if (!page) return 0;
      try {
        // Wait a bit more for list to fully load
        await page.waitForTimeout(1500);
        
        // Scroll to bottom to load all items
        let previousCount = 0;
        let stableCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 30; // Increased for better detection
        
        while (scrollAttempts < maxScrollAttempts) {
          const count = await page.evaluate(() => {
            const sidebar = document.querySelector('[role="main"]');
            if (!sidebar) return 0;
            const candidates = sidebar.querySelectorAll('a, [role="button"], [jsaction]');
            const placeItems = Array.from(candidates).filter((el: Element) => {
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;
              const text = el.textContent || '';
              if (text.trim().length < 10) return false;
              if (text.match(/^(Overview|Reviews|Photos|About)$/)) return false;
              if (text.match(/^(Share|Save|Directions|Nearby)$/)) return false;
              const parent = el.closest('[role="main"]');
              if (!parent) return false;
              if (text.match(/\d\.\d.*\([\d,]+\)/)) return true;
              if (text.match(/\d\.\d.*\(/)) return true;
              if (text.match(/[A-Z][a-z]+/) && text.includes('★')) return true;
              const hasCapitalizedWords = text.match(/[A-Z][a-z]+/);
              const wordCount = text.trim().split(/\s+/).length;
              const hasSubstantialContent = text.trim().length >= 15;
              if (hasCapitalizedWords && (wordCount >= 2 || hasSubstantialContent)) {
                const isNotJustNumbers = !text.match(/^\d+[\s\d,.-]*$/);
                const isNotJustDate = !text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/);
                if (isNotJustNumbers && isNotJustDate) return true;
              }
              return false;
            });
            return placeItems.length;
          });

          // Log for debugging
          if (scrollAttempts === 0) {
            onProgress({ 
              current: 0, 
              total: maxItems, 
              message: `🔍 Initial count: ${count} items found...` 
            });
          }

          if (count === previousCount && count > 0) {
            stableCount++;
            if (stableCount >= 3) break; // Count stayed same for 3 scrolls, we're done
          } else {
            stableCount = 0;
          }

          previousCount = count;
          scrollAttempts++;

          // Scroll down more aggressively
          await page.evaluate(() => {
            const sidebar = document.querySelector('[role="main"]');
            if (!sidebar) return;
            const scrollElement = sidebar.querySelector('[role="feed"]') || sidebar;
            const currentScroll = scrollElement.scrollTop;
            scrollElement.scrollTop = scrollElement.scrollHeight;
            // If scroll didn't change, we're at bottom
            if (scrollElement.scrollTop === currentScroll && currentScroll > 0) {
              return; // Already at bottom
            }
          });
          await page.waitForTimeout(800); // Longer wait for items to load
        }

        onProgress({ 
          current: 0, 
          total: maxItems, 
          message: `🔍 Detection complete: Found ${previousCount} items` 
        });

        return previousCount;
      } catch (e) {
        const error = e as Error;
        onProgress({ 
          current: 0, 
          total: maxItems, 
          message: `⚠️ Error detecting items: ${error.message}. Will use max limit.` 
        });
        return 0;
      }
    }

    const actualItemCount = await countAllItems();
    // Use actual count for progress display, but cap scraping at maxItems
    const totalItems = actualItemCount > 0 ? Math.min(actualItemCount, maxItems) : maxItems;
    
    if (actualItemCount > 0) {
      onProgress({ 
        current: 0, 
        total: totalItems, // Show actual count (capped at maxItems) for progress
        message: `📋 Found ${actualItemCount} items in list. Scraping ${totalItems} items...` 
      });
    } else {
      onProgress({ 
        current: 0, 
        total: maxItems, 
        message: `⚠️ Could not detect item count. Will attempt to scrape up to ${maxItems} items...` 
      });
    }
    let consecutiveFailures = 0;
    let duplicateCount = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
    const MAX_DUPLICATES = 5;

    for (let i = 0; i < totalItems; i++) {
      onProgress({ 
        current: results.length, 
        total: totalItems, 
        message: `Processing item ${i + 1}/${totalItems}...` 
      });

      try {
        if (i > 0 && i % 3 === 0) await scrollListDown();
        const previousUrl = page.url();
        const listItem = await getListItemByIndex(i);

        if (!listItem) {
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
          await scrollListDown();
          continue;
        }

        await clickListItem(listItem);
        await page.waitForTimeout(100);
        let waitAttempts = 0;
        while (!page.url().includes('/place/') && waitAttempts < 4) {
          await page.waitForTimeout(150);
          waitAttempts++;
        }

        const placeUrl = page.url();
        if (placeUrl === previousUrl || !placeUrl.includes('/place/')) continue;
        if (urlsSeen.has(placeUrl)) {
          duplicateCount++;
          if (duplicateCount >= MAX_DUPLICATES) break;
          continue;
        }

        consecutiveFailures = 0;
        duplicateCount = 0;
        urlsSeen.add(placeUrl);

        const placeDetails = await extractPlaceDetails();
        if (!placeDetails.name || placeDetails.name === 'Want to go') continue;

        results.push(placeDetails);
        onProgress({ 
          current: results.length, 
          total: totalItems, 
          message: `✅ Collected: ${placeDetails.name} (${results.length} total)` 
        });

        await page.waitForTimeout(150);
      } catch (e) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
      }
    }

    onProgress({ 
      current: results.length, 
      total: totalItems, 
      message: `🎉 Done! Collected ${results.length} places`,
      status: 'completed',
      results 
    });

    return results;
  } catch (error) {
    const err = error as Error;
    onProgress({ 
      current: results.length, 
      total: maxItems, 
      message: '❌ Error occurred',
      status: 'error',
      error: err.message 
    });
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
  }
}

