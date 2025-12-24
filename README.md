# Google Maps Saved List Scraper (TypeScript)

A Playwright-based scraper built with TypeScript that extracts place information from your Google Maps saved lists.

## Features

- **Comprehensive Data Extraction**: Extracts place name, full address, Place ID, and Google Maps URL
- **Smart Item Detection**: Uses intelligent filtering to identify place items, including places without star ratings
- **Automatic Dialog Handling**: Automatically closes Google Maps dialogs that might block scraping
- **Duplicate Prevention**: Tracks and skips places that have already been collected
- **Error Resilience**: Gracefully handles failures and continues scraping
- **Infinite Scroll Support**: Automatically scrolls the list to load more items
- **Optimized Performance**: Uses carefully tuned timeouts for speed while maintaining reliability

## Installation

```bash
npm install
```

This will install:
- `playwright` - Browser automation
- `typescript` - TypeScript compiler
- `ts-node` - Run TypeScript directly
- `@types/node` - Node.js type definitions

## Usage

### Option 1: Run with ts-node (Recommended for Development)

```bash
# Basic usage (default list, 200 items)
npm run scrape

# Custom list URL
npm run dev "https://maps.app.goo.gl/YOUR_LIST_URL"

# Custom list and max items
npm run dev "https://maps.app.goo.gl/YOUR_LIST_URL" 50
```

### Option 2: Compile and Run

```bash
# Compile TypeScript to JavaScript
npm run build

# Run compiled version
npm start

# Or run compiled version with arguments
node dist/scrapper.js "https://maps.app.goo.gl/YOUR_LIST_URL" 50
```

### Option 3: Direct ts-node Execution

```bash
ts-node scrapper.ts
ts-node scrapper.ts "https://maps.app.goo.gl/YOUR_LIST_URL"
ts-node scrapper.ts "https://maps.app.goo.gl/YOUR_LIST_URL" 50
```

## Parameters

1. **List URL** (optional): Your Google Maps saved list URL
   - Default: Uses the hardcoded URL in the script
   
2. **Max Items** (optional): Maximum number of places to scrape
   - Default: 200

## Output

The scraper creates a JSON file with timestamp:
```
google_maps_places_2024-12-23T10-30-45-123Z.json
```

Example output format:
```json
[
  {
    "name": "Central Park",
    "url": "https://www.google.com/maps/place/...",
    "address": "New York, NY 10024, USA",
    "placeId": "0x89c2589a018531e3:0xb9df1f7387a94119"
  },
  {
    "name": "Times Square",
    "url": "https://www.google.com/maps/place/...",
    "address": "Manhattan, NY 10036, USA",
    "placeId": "0x89c25855c6480299:0x55194ec5a1ae072e"
  }
]
```

## How It Works

The scraper uses Playwright to automate a Chromium browser and intelligently navigate through Google Maps saved lists. Here's a detailed breakdown of the process:

### 1. Initialization
- Launches a Chromium browser (visible by default for debugging)
- Navigates to the Google Maps saved list URL
- Waits for the sidebar to load and handles any initial dialogs

### 2. Dialog Management
The scraper automatically handles various Google Maps dialogs that might block interaction:
- **Cancel dialogs** ("Join to edit this list?")
- **Close buttons** (X buttons on place/share/info dialogs)
- **Dismiss buttons** ("No thanks", "Dismiss", "Not now")
- **ESC key fallback** for any remaining dialogs

It attempts to close dialogs up to 3 times to ensure the page is ready for interaction.

### 3. List Item Detection
The scraper uses JavaScript to intelligently find place items in the sidebar:

**Smart Filtering Algorithm:**
- Scans all clickable elements (`<a>`, `[role="button"]`, `[jsaction]`) in the sidebar
- Filters candidates based on multiple criteria:
  - Must be visible (has width and height)
  - Must contain substantial text (at least 10 characters)
  - Excludes navigation tabs (Overview, Reviews, Photos, About)
  - Excludes action buttons (Share, Save, Directions, Nearby)
  
**Place Identification:**
The scraper identifies place items using multiple patterns:
1. **Rating patterns** (most reliable): Items with star ratings like `4.5 (123)`
2. **Star symbols**: Items containing ★ symbols
3. **Fallback pattern**: Items with capitalized words (place names) that:
   - Have multiple words OR substantial content (15+ chars)
   - Are not just numbers or dates
   - Look like actual place names

This fallback ensures places **without star ratings** are still captured.

### 4. Main Scraping Loop
For each item in the list (up to MAX_ITEMS):

1. **Scroll Management**: Every 3 items, the list is scrolled down to load more items
2. **Item Selection**: Uses JavaScript to find the list item by index
3. **Navigation**: Clicks the item directly to open the place detail page
4. **URL Validation**: 
   - Waits for URL to change and contain `/place/`
   - Skips if URL didn't change (might have clicked a tab/button)
   - Skips if not a valid place URL
5. **Duplicate Detection**: Tracks seen URLs and skips duplicates
6. **Data Extraction**: Extracts place details (see below)
7. **Error Handling**: Continues to next item if extraction fails

### 5. Data Extraction
When a place page is opened, the scraper extracts:

**Place Name** (tries multiple methods):
- Extracts from URL path (`/place/PlaceName`)
- Looks for `<h1>` elements (excluding list names)
- Extracts from aria-label attributes (e.g., "Save PlaceName to...")

**Address**:
- Finds the address button using `[data-item-id="address"]`
- Extracts text from the address div

**Place ID**:
- Extracts from URL pattern `!1s(0x...)` (Google's internal place identifier)

**URL**:
- Captures the full Google Maps URL for the place

### 6. Smart Stopping Conditions
The scraper stops early if:
- **3 consecutive failures**: Can't find list items (likely reached end of list)
- **5 consecutive duplicates**: All remaining items have been collected
- **Maximum items reached**: Collected the requested number of items

### 7. Output
All collected data is saved to a timestamped JSON file with the format:
```
google_maps_places_2024-12-23T10-30-45-123Z.json
```

### Performance Optimizations
The scraper uses optimized timeouts:
- **Page loading waits**: 560-672ms (optimized for speed while maintaining reliability)
- **Dialog handling**: 200-400ms delays
- **Scrolling**: 350ms wait for items to load
- **Navigation checks**: 200-250ms between operations

These timings balance speed with reliability, ensuring pages load fully before extraction while minimizing unnecessary delays.

## Technical Architecture

### Core Technologies
- **Playwright**: Browser automation framework for Chromium
- **TypeScript**: Type-safe JavaScript for better code reliability
- **DOM Manipulation**: Uses JavaScript evaluation to interact with Google Maps' dynamic content

### Key Design Decisions

1. **JavaScript-based Item Detection**: Instead of relying on CSS selectors that may break, the scraper uses JavaScript to analyze the DOM and intelligently filter place items based on content patterns.

2. **Multi-method Data Extraction**: Uses multiple fallback methods to extract place names and addresses, ensuring data is captured even if Google Maps changes their UI structure.

3. **Optimized Timeouts**: Carefully balanced timeouts ensure pages load fully while minimizing unnecessary delays. Page loading waits are optimized to ~560-672ms, while operational delays are kept minimal (150-400ms).

4. **Progressive Scrolling**: Scrolls the list every 3 items to load more content, ensuring all items are accessible without overwhelming the page.

## Tips

- **Browser stays open**: The browser runs in non-headless mode so you can see what's happening
- **Rate limiting**: Built-in delays prevent Google from blocking requests
- **Duplicate handling**: Automatically skips places that have already been collected
- **Error handling**: Gracefully handles failed navigations and continues
- **Places without ratings**: The scraper can now detect and scrape places that don't have star ratings
- **Performance**: Optimized timeouts balance speed with reliability

## Troubleshooting

### "Navigation failed" errors
- The list might have fewer items than requested
- Try reducing the MAX_ITEMS parameter

### Missing data fields
- Some places might not have addresses or certain fields
- The scraper will mark these as `null`

### Dialogs blocking the scraper
- The scraper automatically handles common Google Maps dialogs
- If you see persistent blocking, you may need to manually close dialogs

## Making it headless

To run without visible browser (faster):

Edit `scrapper.ts` and change the browser launch options:
```typescript
browser = await chromium.launch({ headless: true });
```

## Example Commands

```bash
# Scrape default list, 200 items
npm run scrape

# Scrape custom list, 200 items (default)
npm run dev "https://maps.app.goo.gl/abc123"

# Scrape custom list, 100 items
npm run dev "https://maps.app.goo.gl/abc123" 100

# Or using ts-node directly
ts-node scrapper.ts "https://maps.app.goo.gl/abc123" 100
```

## Dependencies

- **Playwright**: Headless browser automation
- **Node.js**: v14 or higher recommended

