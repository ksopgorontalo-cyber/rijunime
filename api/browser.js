const puppeteer = require('puppeteer');
const { safeTrack, trackError } = require('./utils/metrics');

let browser = null;
let isLaunching = false;
let launchPromise = null;

/**
 * Get or create a browser instance
 */
async function getBrowser() {
  if (browser) {
    return browser;
  }
  
  if (isLaunching) {
    return await launchPromise;
  }
  
  isLaunching = true;
  launchPromise = launchBrowser();
  
  try {
    browser = await launchPromise;
    return browser;
  } finally {
    isLaunching = false;
    launchPromise = null;
  }
}

/**
 * Launch a new browser instance
 */
async function launchBrowser() {
  console.log('Launching headless browser...');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
    ignoreHTTPSErrors: true
  });
  
  // Close browser on process exit
  process.on('exit', () => {
    if (browser && browser.process() != null) {
      browser.close();
    }
  });
  
  return browser;
}

/**
 * Sleep function for waiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a page using puppeteer
 */
async function fetchWithBrowser(url, options = {}) {
  const browser = await getBrowser();
  
  console.log(`Fetching ${url} with puppeteer...`);
  const page = await browser.newPage();
  
  try {
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Navigate to the URL
    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30000
    });
    
    // Wait for selectors that indicate page has loaded
    const waitForSelectors = options.waitForSelectors || ['body', '.container', '.content', 'h1'];
    let selectorFound = false;
    for (const selector of waitForSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`Found selector: ${selector}`);
        selectorFound = true;
        break;
      } catch (e) {
        console.log(`Selector ${selector} not found`);
      }
    }
    
    // Wait additional time if specified
    if (options.extraWaitTime) {
      console.log(`Waiting additional ${options.extraWaitTime}ms...`);
      await sleep(options.extraWaitTime);
    }
    
    // Get HTML content
    const html = await page.content();
    console.log(`Fetched HTML length: ${html.length}`);
    
    // Track browser fetch performance
    safeTrack('browser_fetch_success', { 
      url: url,
      htmlLength: html.length,
      status: response.status(),
      selectorFound: selectorFound 
    });
    
    return {
      html,
      status: response.status(),
      headers: response.headers()
    };
  } finally {
    await page.close();
  }
}

/**
 * Close the browser instance
 */
async function closeBrowser() {
  if (browser) {
    console.log('Closing browser...');
    await browser.close();
    browser = null;
  }
}

module.exports = {
  fetchWithBrowser,
  closeBrowser
}; 