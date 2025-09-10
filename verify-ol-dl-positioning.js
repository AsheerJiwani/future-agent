const { chromium } = require('playwright');

async function verifyOLDLPositioning() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    console.log('2. Looking for Football Playbook Coach tab...');
    
    // Try different selectors for the tab
    const tabSelectors = [
      'text="Football Playbook Coach"',
      '[role="tab"]:has-text("Football Playbook Coach")',
      'button:has-text("Football Playbook Coach")',
      '[data-testid*="football"]',
      '[aria-label*="football"]'
    ];
    
    let tabFound = false;
    for (const selector of tabSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`Found tab with selector: ${selector}`);
          await element.click();
          tabFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!tabFound) {
      console.log('Could not find Football Playbook Coach tab. Available tabs:');
      const tabs = await page.locator('[role="tab"], button, .tab').all();
      for (const tab of tabs) {
        try {
          const text = await tab.textContent();
          console.log(`- Tab: "${text}"`);
        } catch (e) {
          // Skip if can't read text
        }
      }
      
      // Take a screenshot to see what's available
      await page.screenshot({ path: 'debug-tabs.png', fullPage: true });
      console.log('Debug screenshot saved as debug-tabs.png');
    }

    await page.waitForTimeout(1000);

    console.log('3. Entering full screen mode and waiting 5 seconds...');
    // Simulate F11 key press for full screen
    await page.keyboard.press('F11');
    await page.waitForTimeout(5000);

    console.log('4. Looking for Football Panel...');
    
    // Try to find Football Panel or Play Simulator
    const panelSelectors = [
      'text="Football Panel"',
      'text="Play Simulator"',
      '[data-testid="football-panel"]',
      '[data-testid="play-simulator"]',
      'button:has-text("Football")',
      'button:has-text("Play")',
      'button:has-text("Simulator")'
    ];
    
    let panelFound = false;
    for (const selector of panelSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`Found panel with selector: ${selector}`);
          await element.click();
          panelFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!panelFound) {
      console.log('Could not find Football Panel. Looking for any clickable elements...');
      const buttons = await page.locator('button, [role="button"], .btn').all();
      for (const button of buttons) {
        try {
          const text = await button.textContent();
          if (text && text.length > 0) {
            console.log(`- Button: "${text.trim()}"`);
          }
        } catch (e) {
          // Skip if can't read text
        }
      }
    }

    await page.waitForTimeout(2000);

    console.log('5. Looking for Play Simulator...');
    
    const simulatorSelectors = [
      'text="Play Simulator"',
      '[data-testid="play-simulator"]',
      '[data-testid="field-root"]',
      'svg',
      'canvas',
      '.field',
      '.simulator'
    ];
    
    let simulatorFound = false;
    for (const selector of simulatorSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`Found simulator with selector: ${selector}`);
          if (selector.includes('text=') || selector.includes('button')) {
            await element.click();
          }
          simulatorFound = true;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    await page.waitForTimeout(2000);

    console.log('6. Taking screenshot for OL/DL positioning verification...');
    await page.screenshot({ 
      path: 'ol-dl-positioning-verification.png', 
      fullPage: true 
    });

    console.log('7. Looking for field elements and player positions...');
    
    // Look for offensive and defensive line players
    const olSelectors = [
      '[data-testid*="ol"]',
      '[data-testid*="offensive-line"]',
      '[data-position*="ol"]',
      '[class*="ol"]',
      '[class*="offensive"]'
    ];
    
    const dlSelectors = [
      '[data-testid*="dl"]',
      '[data-testid*="defensive-line"]',
      '[data-position*="dl"]',
      '[class*="dl"]',
      '[class*="defensive"]'
    ];
    
    console.log('Checking for OL elements...');
    for (const selector of olSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`Found ${elements.length} OL elements with selector: ${selector}`);
          for (let i = 0; i < elements.length; i++) {
            const box = await elements[i].boundingBox();
            if (box) {
              console.log(`  OL ${i + 1}: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
            }
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    console.log('Checking for DL elements...');
    for (const selector of dlSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`Found ${elements.length} DL elements with selector: ${selector}`);
          for (let i = 0; i < elements.length; i++) {
            const box = await elements[i].boundingBox();
            if (box) {
              console.log(`  DL ${i + 1}: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
            }
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // Look for line of scrimmage
    const losSelectors = [
      '[data-testid*="los"]',
      '[data-testid*="line-of-scrimmage"]',
      '[class*="los"]',
      '[class*="scrimmage"]',
      'line[stroke*="red"]',
      'line[stroke*="blue"]'
    ];
    
    console.log('Checking for Line of Scrimmage...');
    for (const selector of losSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`Found ${elements.length} LOS elements with selector: ${selector}`);
          for (let i = 0; i < elements.length; i++) {
            const box = await elements[i].boundingBox();
            if (box) {
              console.log(`  LOS ${i + 1}: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);
            }
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    console.log('8. Checking page content for football elements...');
    const pageContent = await page.content();
    const footballKeywords = ['offensive', 'defensive', 'line', 'scrimmage', 'field', 'player', 'position'];
    
    for (const keyword of footballKeywords) {
      const count = (pageContent.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
      if (count > 0) {
        console.log(`Found "${keyword}" ${count} times in page content`);
      }
    }

    console.log('\n=== VERIFICATION COMPLETE ===');
    console.log('Screenshots saved: ol-dl-positioning-verification.png');
    
    // Exit full screen before closing
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

  } catch (error) {
    console.error('Error during verification:', error);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

verifyOLDLPositioning();