import { chromium, Browser, Page, ElementHandle } from 'playwright';
import * as fs from 'fs';

// Interface for place details
interface PlaceDetails {
  name: string | null;
  url: string;
  address: string | null;
  placeId: string | null;
}

// Get list URL from command line or use default
const LIST_URL: string = process.argv[2] || 'https://maps.app.goo.gl/vjh2BSZ8EpCwSBuf8?g_st=ac';
const MAX_ITEMS: number = parseInt(process.argv[3]) || 200;

console.log('\n' + '='.repeat(60));
console.log('🗺️  GOOGLE MAPS SCRAPER (TypeScript)');
console.log('='.repeat(60));
console.log(`📋 List URL: ${LIST_URL}`);
console.log(`🔢 Max items: ${MAX_ITEMS}`);
console.log('='.repeat(60) + '\n');

(async (): Promise<void> => {
  let browser: Browser | undefined;
  let page: Page | undefined;
  const results: PlaceDetails[] = [];
  const urlsSeen: Set<string> = new Set();
  
  try {
    console.log('🚀 Launching browser...');
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    console.log('🌍 Navigating to Google Maps list...');
    console.log(`📍 List URL: ${LIST_URL}`);
    await page.goto(LIST_URL, {
      waitUntil: 'domcontentloaded'
    });

  /* ----------------------------------------
     CLOSE ANY GOOGLE MAPS DIALOG
     ---------------------------------------- */
  async function closeAnyDialog(): Promise<void> {
    if (!page) return;
    
    console.log('🔍 DEBUG: Checking for dialogs to close...');
    // Maps injects dialogs late
    await page.waitForTimeout(250);

    // Try multiple times to close dialogs
    for (let attempt = 0; attempt < 3; attempt++) {
      let closedSomething = false;

      // Close "Join to edit this list?"
      try {
        const cancelBtn = page.locator('button[aria-label="Cancel"]');
        if (await cancelBtn.isVisible({ timeout: 500 })) {
          await cancelBtn.click();
          console.log('🪟 Cancel dialog closed');
          await page.waitForTimeout(100);
          closedSomething = true;
        }
      } catch {}

      // Close X-based dialogs (place / share / info)
      try {
        const closeBtn = page.locator('button[aria-label="Close"]');
        if (await closeBtn.isVisible({ timeout: 500 })) {
          await closeBtn.click();
          console.log('❎ X dialog closed');
          await page.waitForTimeout(100);
          closedSomething = true;
        }
      } catch {}

      // Try "No thanks" or similar buttons
      try {
        const noThanksBtn = page.locator('button:has-text("No thanks"), button:has-text("Dismiss"), button:has-text("Not now")');
        if (await noThanksBtn.first().isVisible({ timeout: 500 })) {
          await noThanksBtn.first().click();
          console.log('👎 Dismiss button closed');
          await page.waitForTimeout(100);
          closedSomething = true;
        }
      } catch {}

      // Try ESC key as last resort
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
      } catch {}

      if (!closedSomething) {
        console.log('🔍 DEBUG: No more dialogs found');
        break;
      }
    }
  }

  /* ----------------------------------------
     GET LIST ITEM BY INDEX USING JS
     ---------------------------------------- */
  async function getListItemByIndex(index: number): Promise<ElementHandle | null> {
    if (!page) return null;
    
      try {
        console.log(`🔍 DEBUG: Getting list item at index ${index} using JavaScript...`);
        
        // Use JavaScript to find clickable elements in the sidebar
        const element = await page.evaluateHandle((idx: number) => {
          const sidebar = document.querySelector('[role="main"]');
          if (!sidebar) return null;
          
          // Find all clickable elements that look like list items
        const candidates = sidebar.querySelectorAll('a, [role="button"], [jsaction]');
          
          // Filter to find actual place list items
        const placeItems = Array.from(candidates).filter((el: Element) => {
            // Must be visible
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            
            // Must contain some text
            const text = el.textContent || '';
          if (text.trim().length < 10) return false;
            
            // Exclude tabs (Reviews, Photos, etc.)
            if (text.match(/^(Overview|Reviews|Photos|About)$/)) return false;
            
            // Exclude if it's just a button label
            if (text.match(/^(Share|Save|Directions|Nearby)$/)) return false;
            
            // Must be in the sidebar list area (not map markers)
            const parent = el.closest('[role="main"]');
            if (!parent) return false;
            
            // Likely contains rating (star rating pattern) - most reliable
            if (text.match(/\d\.\d.*\([\d,]+\)/)) return true;
            
            // Or just has a rating number followed by parentheses
            if (text.match(/\d\.\d.*\(/)) return true;
            
            // Or contains place-like names with star ratings
            if (text.match(/[A-Z][a-z]+/) && text.includes('★')) return true;
            
          // FALLBACK: Accept items that look like place names even without ratings
          // Must have capitalized words (place names typically start with capital letters)
          // Must have multiple words or be a substantial single word
          // Must not be just numbers or special characters
          const hasCapitalizedWords = text.match(/[A-Z][a-z]+/);
          const wordCount = text.trim().split(/\s+/).length;
          const hasSubstantialContent = text.trim().length >= 15; // At least 15 chars
          
          if (hasCapitalizedWords && (wordCount >= 2 || hasSubstantialContent)) {
            // Additional check: exclude if it's clearly not a place (just numbers, dates, etc.)
            const isNotJustNumbers = !text.match(/^\d+[\s\d,.-]*$/);
            const isNotJustDate = !text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/);
            
            if (isNotJustNumbers && isNotJustDate) {
                return true;
              }
            }
            
            return false;
          });
          
        console.log(`Found ${placeItems.length} place items in sidebar`);
          
        // Debug: log ALL items on first pass to see what we're finding
        if (idx === 0 && placeItems.length > 0) {
          console.log('📋 ALL ITEMS FOUND IN LIST:');
            placeItems.forEach((item, i) => {
            const itemText = item.textContent?.trim().substring(0, 60) || '';
            console.log(`  ${i}: ${itemText}...`);
            });
          }
          
        return placeItems[idx] || null;
        }, index);
        
        if (!element) {
        console.log(`⚠️ Could not find list item at index ${index}`);
          return null;
        }
        
        // Convert JSHandle to ElementHandle
        const elementHandle = element.asElement();
          return elementHandle;
      } catch (e) {
        const error = e as Error;
        console.error('❌ ERROR in getListItemByIndex:', error.message);
        return null;
      }
  }

  /* ----------------------------------------
     CHECK IF WE CAN SCROLL MORE IN LIST
     ---------------------------------------- */
  async function canScrollMore(): Promise<boolean> {
    if (!page) return false;
    
    try {
      const result = await page.evaluate(() => {
        const sidebar = document.querySelector('[role="main"]');
        if (!sidebar) return false;
        
        // Check if we can scroll down more
        const scrollElement = sidebar.querySelector('[role="feed"]') || sidebar;
        const isAtBottom = scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 50;
        
        return !isAtBottom;
      });
      
      return result;
    } catch (e) {
      console.log('⚠️ Could not check scroll status');
      return false;
    }
  }

  /* ----------------------------------------
     SCROLL LIST DOWN TO LOAD MORE ITEMS
     ---------------------------------------- */
  async function scrollListDown(): Promise<void> {
    if (!page) return;
    
    try {
      console.log('🔍 DEBUG: Scrolling list down to load more items...');
      await page.evaluate(() => {
        const sidebar = document.querySelector('[role="main"]');
        if (!sidebar) return;
        
        const scrollElement = sidebar.querySelector('[role="feed"]') || sidebar;
        scrollElement.scrollTop += 300;
      });
      
      await page.waitForTimeout(200); // Wait for items to load
    } catch (e) {
      console.log('⚠️ Could not scroll list');
    }
  }

  /* ----------------------------------------
     CLICK ON LIST ITEM (DIRECT CLICK)
     ---------------------------------------- */
  async function clickListItem(item: ElementHandle): Promise<void> {
    if (!page) return;
    
    try {
      console.log('🔍 DEBUG: Closing any dialogs...');
      await closeAnyDialog();
      
      console.log('🔍 DEBUG: Clicking on list item...');
      await item.click();
      
      console.log('🔍 DEBUG: Waiting for place details to load...');
      await page.waitForTimeout(400); // Fast navigation wait
      
      console.log('🔍 DEBUG: Current URL:', page.url());
    } catch (e) {
      const error = e as Error;
      console.error('❌ ERROR in clickListItem:', error.message);
      throw e;
    }
  }

  /* ----------------------------------------
     OPEN LIST ITEM BY KEYBOARD (FALLBACK)
     ---------------------------------------- */
  async function openItemByKeyboard(index: number, isFirstItem: boolean): Promise<void> {
    if (!page) return;
    
    try {
      console.log(`🔍 DEBUG: Using keyboard navigation for item ${index}`);
      
      // Always close any dialog and refocus the sidebar
      await closeAnyDialog();
      await page.waitForTimeout(100);
      
      // Make sure sidebar has focus
      console.log('🔍 DEBUG: Clicking sidebar to ensure focus...');
      await page.click('[role="main"]');
      await page.waitForTimeout(100);
      
      if (isFirstItem) {
        // First item: start from the very beginning
        console.log('🔍 DEBUG: Pressing Home to reset position...');
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // DON'T press ArrowDown yet - we're already at the first item after Home
        console.log('🔍 DEBUG: At first item position');
      } else {
        // Subsequent items: just move to next one
        console.log('🔍 DEBUG: Moving to next item with ArrowDown...');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);
      }

      // Press Enter to open
      console.log('🔍 DEBUG: Pressing Enter to open...');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500); // Wait for place to open
      
      console.log('🔍 DEBUG: Current URL:', page.url());
    } catch (e) {
      const error = e as Error;
      console.error('❌ ERROR in openItemByKeyboard:', error.message);
      throw e;
    }
  }

  /* ----------------------------------------
     EXTRACT PLACE DETAILS
     ---------------------------------------- */
  async function extractPlaceDetails(): Promise<PlaceDetails> {
    if (!page) throw new Error('Page not initialized');
    
    try {
      console.log('🔍 DEBUG: Starting place details extraction...');
      await page.waitForTimeout(300); // Let page load

      const details: PlaceDetails = {
        name: null,
        url: page.url(),
        address: null,
        placeId: null
      };

      console.log('🔍 DEBUG: Extracting from URL:', details.url);

      // Extract Place ID from URL
      const urlMatch = details.url.match(/!1s(0x[a-f0-9:]+)/);
      if (urlMatch) {
        details.placeId = urlMatch[1];
        console.log('🔍 DEBUG: Extracted Place ID:', details.placeId);
      } else {
        console.log('⚠️ DEBUG: No Place ID found in URL');
      }

      // Extract place name - Try multiple methods
      try {
        console.log('🔍 DEBUG: Looking for place name...');
        
        // Method 1: Look for the place name in the URL (most reliable)
        const urlNameMatch = details.url.match(/\/place\/([^/@]+)/);
        if (urlNameMatch) {
          details.name = decodeURIComponent(urlNameMatch[1].replace(/\+/g, ' '));
          console.log('🔍 DEBUG: Extracted name from URL:', details.name);
        }
        
        // Method 2: Look for h1 that's NOT the list name
        if (!details.name || details.name === 'Want to go') {
          console.log('🔍 DEBUG: Looking for h1 element...');
          const h1Elements = await page.locator('h1').all();
          
          for (const h1 of h1Elements) {
            const text = await h1.textContent();
            // Skip if it's the list name or empty
            if (text && text !== 'Want to go' && text.trim().length > 0) {
              details.name = text;
              console.log('🔍 DEBUG: Found name from h1:', details.name);
              break;
            }
          }
        }
        
        // Method 3: Look for button with place name
        if (!details.name || details.name === 'Want to go') {
          console.log('🔍 DEBUG: Looking for place name in aria-label...');
          const nameBtn = await page.locator('[aria-label*="Save"][aria-label*="to"]').first();
          if (await nameBtn.isVisible({ timeout: 400 })) {
            const ariaLabel = await nameBtn.getAttribute('aria-label');
            const match = ariaLabel?.match(/Save (.+?) to/);
            if (match) {
              details.name = match[1];
              console.log('🔍 DEBUG: Found name from aria-label:', details.name);
            }
          }
        }
        
      } catch (e) {
        const error = e as Error;
        console.log('⚠️ Could not extract name:', error.message);
      }

      // Extract address
      try {
        console.log('🔍 DEBUG: Looking for address...');
        const addressButton = page.locator('button[data-item-id="address"]');
        if (await addressButton.isVisible({ timeout: 800 })) {
          const addressDiv = addressButton.locator('div[class*="fontBodyMedium"]').first();
          details.address = await addressDiv.textContent();
          console.log('🔍 DEBUG: Found address:', details.address);
        }
      } catch (e) {
        const error = e as Error;
        console.log('⚠️ Could not extract address:', error.message);
      }

      return details;
    } catch (e) {
      const error = e as Error;
      console.error('❌ ERROR in extractPlaceDetails:', error.message);
      throw e;
    }
  }

  /* ----------------------------------------
     INITIAL SYNC
     ---------------------------------------- */
  console.log('🔍 DEBUG: Waiting for sidebar to load...');
  await page.waitForSelector('[role="main"]', { timeout: 15000 });
  console.log('📋 Sidebar loaded');
  
  // Give time for any dialogs to appear
  console.log('⏳ Waiting for dialogs to appear...');
  await page.waitForTimeout(1000);
  
  console.log('🔍 DEBUG: Attempting to close any initial dialogs...');
  await closeAnyDialog();
  
  // Extra wait and try closing again
  await page.waitForTimeout(200);
  await closeAnyDialog();
  
  // Take a screenshot for debugging
  try {
    await page.screenshot({ path: 'initial_list_view.png' });
    console.log('📸 Screenshot saved: initial_list_view.png');
  } catch (e) {
    console.log('⚠️ Could not take screenshot');
  }

  /* ----------------------------------------
     MAIN LOOP - Get and click each item by index
     ---------------------------------------- */
  const totalItems: number = MAX_ITEMS;
  console.log(`📊 Will attempt to scrape up to ${totalItems} places`);

  let consecutiveFailures = 0;
  let duplicateCount = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  const MAX_DUPLICATES = 5;

  for (let i = 0; i < totalItems; i++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`➡️ [${i + 1}/${totalItems}] Opening place...`);
    console.log('='.repeat(60));

    try {
      // Scroll list every 3 items to load more
      if (i > 0 && i % 3 === 0) {
        await scrollListDown();
      }

      const previousUrl: string = page.url();
      
      // Try to get the list item using JavaScript
      const listItem = await getListItemByIndex(i);
      
      if (!listItem) {
        console.log('⚠️ Could not find list item at this index');
        consecutiveFailures++;
        
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`\n🛑 Reached end of list (${MAX_CONSECUTIVE_FAILURES} consecutive failures)`);
          console.log('📋 No more items to scrape');
          break;
        }
        
        // Try scrolling and continue
        await scrollListDown();
        continue;
      }
      
      // SUCCESS: Found item with JavaScript, click it directly
      console.log('🔍 DEBUG: Found item with JavaScript, clicking...');
      await clickListItem(listItem);

      // Wait for navigation to complete and URL to update
      await page.waitForTimeout(100);
      
      // Wait until URL contains /place/ (indicating successful navigation)
      let waitAttempts = 0;
      while (!page.url().includes('/place/') && waitAttempts < 4) {
        await page.waitForTimeout(150);
        waitAttempts++;
      }

      const placeUrl: string = page.url();
      console.log('🔍 DEBUG: Place URL:', placeUrl);

      // Check if URL actually changed and is a valid place URL
      if (placeUrl === previousUrl) {
        console.log('⚠️ SKIPPED: URL did not change - might have clicked a tab or button');
        console.log(`   Previous: ${previousUrl.substring(0, 80)}...`);
        console.log(`   Current:  ${placeUrl.substring(0, 80)}...`);
        continue;
      }

      // Must contain /place/ to be a valid place page
      if (!placeUrl.includes('/place/')) {
        console.log('⚠️ SKIPPED: Not a place URL');
        console.log(`   URL: ${placeUrl.substring(0, 100)}...`);
        continue;
      }

      // Check for duplicates
      if (urlsSeen.has(placeUrl)) {
        console.log(`⏭️ SKIPPED: Already collected this place (duplicate)`);
        console.log(`   URL: ${placeUrl.substring(0, 80)}...`);
        duplicateCount++;
        
        if (duplicateCount >= MAX_DUPLICATES) {
          console.log(`\n🛑 Reached end of list (${MAX_DUPLICATES} duplicates in a row)`);
          console.log('📋 All unique places have been scraped');
          break;
        }
        
        continue;
      }
      
      // Reset counters on success
      consecutiveFailures = 0;
      duplicateCount = 0;
      urlsSeen.add(placeUrl);
      
      console.log('🔍 DEBUG: New place detected, extracting details...');
      
      // Extract all place details
      const placeDetails: PlaceDetails = await extractPlaceDetails();
      
      // Validate we got a real place name (not the list name)
      if (!placeDetails.name || placeDetails.name === 'Want to go') {
        console.log('⚠️ Could not extract proper place name (got: "' + placeDetails.name + '"), skipping');
        console.log('   URL was:', placeDetails.url);
        continue;
      }
      
      results.push(placeDetails);
      console.log(`📍 Total collected so far: ${results.length}`);
      
      console.log(`\n✅ Collected place:`);
      console.log(`   Name: ${placeDetails.name}`);
      console.log(`   Address: ${placeDetails.address}`);
      console.log(`   Place ID: ${placeDetails.placeId}`);
      console.log(`   URL: ${placeDetails.url}`);

      // Small delay before moving to next item
      console.log('🔍 DEBUG: Waiting before next item...');
      await page.waitForTimeout(150);
      
    } catch (e) {
      const error = e as Error;
      console.log('❌ ERROR: Failed to process this place, skipping');
      console.error('❌ Error details:', error.message);
      
      consecutiveFailures++;
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(`\n🛑 Too many consecutive errors, stopping`);
        break;
      }
      
      // Try to take a screenshot for debugging
      try {
        const screenshotPath = `error_screenshot_${i}.png`;
        await page.screenshot({ path: screenshotPath });
        console.log(`📸 Screenshot saved to: ${screenshotPath}`);
      } catch (screenshotError) {
        const err = screenshotError as Error;
        console.log('❌ Could not take screenshot:', err.message);
      }
    }
  }

  console.log(`\n🎉 Done! Collected ${results.length} places`);
  console.log(`📊 Attempted to process ${totalItems} items`);

  } catch (error) {
    const err = error as Error;
    console.error('\n❌❌❌ FATAL ERROR ❌❌❌');
    console.error('Error message:', err.message);
    console.error('Stack trace:', err.stack);
    
    // Try to take a screenshot
    try {
      if (page) {
        await page.screenshot({ path: 'fatal_error.png' });
        console.log('📸 Fatal error screenshot saved to: fatal_error.png');
      }
    } catch (e) {
      console.log('Could not take fatal error screenshot');
    }
  } finally {
    // Always save results even if there was an error
    if (results.length > 0) {
      try {
        const timestamp: string = new Date().toISOString().replace(/[:.]/g, '-');
        const filename: string = `google_maps_places_${timestamp}.json`;
        
        fs.writeFileSync(filename, JSON.stringify(results, null, 2));
        console.log(`\n💾 Saved ${results.length} collected places to: ${filename}`);

        // Display summary
        console.log('\n📊 Summary:');
        results.forEach((place: PlaceDetails, idx: number) => {
          console.log(`${idx + 1}. ${place.name || 'Unknown'} - ${place.address || 'No address'}`);
        });
      } catch (saveError) {
        const err = saveError as Error;
        console.error('❌ Could not save results:', err.message);
      }
    } else {
      console.log('\n⚠️ No results to save');
    }

    // Always close browser
    if (browser) {
      try {
        console.log('\n🔒 Closing browser...');
        await browser.close();
        console.log('✅ Browser closed');
      } catch (closeError) {
        const err = closeError as Error;
        console.error('❌ Error closing browser:', err.message);
      }
    }
  }
})().catch((err: Error) => {
  console.error('\n❌❌❌ UNHANDLED ERROR ❌❌❌');
  console.error(err);
  process.exit(1);
});

