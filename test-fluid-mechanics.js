const { chromium } = require('playwright');

(async () => {
  console.log('🏈 Starting Fluid DL/OL Mechanics Testing...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    console.log('📍 Navigating to http://localhost:3009...');
    await page.goto('http://localhost:3009');
    await page.waitForTimeout(3000);

    // Click on Football Playbook Coach tab
    console.log('🏃‍♂️ Clicking Football Playbook Coach tab...');
    const coachTab = await page.locator('text=Football Playbook Coach').first();
    if (await coachTab.isVisible()) {
      await coachTab.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠️ Football Playbook Coach tab not found, trying alternative selectors...');
      const altTab = await page.locator('[data-testid*="coach"], [class*="coach"], button:has-text("Coach")').first();
      if (await altTab.isVisible()) {
        await altTab.click();
        await page.waitForTimeout(2000);
      }
    }

    // Enter full screen mode (F11)
    console.log('🖥️ Entering full screen mode...');
    await page.keyboard.press('F11');
    await page.waitForTimeout(5000); // Wait 5 seconds as required

    // Navigate to Football Panel
    console.log('🏈 Navigating to Football Panel...');
    const footballPanel = await page.locator('text=Football Panel').first();
    if (await footballPanel.isVisible()) {
      await footballPanel.click();
      await page.waitForTimeout(1000);
    } else {
      console.log('⚠️ Football Panel not found, trying alternative selectors...');
      const altPanel = await page.locator('[data-testid*="football"], [class*="football"], button:has-text("Panel")').first();
      if (await altPanel.isVisible()) {
        await altPanel.click();
        await page.waitForTimeout(1000);
      }
    }

    // Navigate to Play Simulator
    console.log('⚡ Navigating to Play Simulator...');
    const playSimulator = await page.locator('text=Play Simulator').first();
    if (await playSimulator.isVisible()) {
      await playSimulator.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠️ Play Simulator not found, trying alternative selectors...');
      const altSimulator = await page.locator('[data-testid*="simulator"], [class*="simulator"], button:has-text("Simulator")').first();
      if (await altSimulator.isVisible()) {
        await altSimulator.click();
        await page.waitForTimeout(2000);
      }
    }

    // Take initial screenshot
    console.log('📸 Taking initial screenshot...');
    await page.screenshot({ 
      path: 'fluid-mechanics-initial.png',
      fullPage: true 
    });

    // Look for the field element
    console.log('🏟️ Looking for field element...');
    const fieldSelectors = [
      '[data-testid="field-root"]',
      '.field-container',
      'canvas',
      'svg',
      '.football-field',
      '.play-field'
    ];

    let fieldElement = null;
    for (const selector of fieldSelectors) {
      const element = await page.locator(selector).first();
      if (await element.isVisible()) {
        fieldElement = element;
        console.log(`✅ Found field element with selector: ${selector}`);
        break;
      }
    }

    if (!fieldElement) {
      console.log('❌ No field element found, taking debug screenshot...');
      await page.screenshot({ 
        path: 'debug-no-field.png',
        fullPage: true 
      });
      
      // Try to find any interactive elements
      console.log('🔍 Looking for any interactive elements...');
      const buttons = await page.locator('button').all();
      console.log(`Found ${buttons.length} buttons on page`);
      
      for (let i = 0; i < Math.min(buttons.length, 5); i++) {
        const buttonText = await buttons[i].textContent();
        console.log(`Button ${i}: "${buttonText}"`);
      }
      
      return;
    }

    // Test starting plays and observing DL movements
    console.log('🚀 Testing play mechanics...');
    
    // Look for play control buttons
    const playButtons = [
      'button:has-text("Start")',
      'button:has-text("Run")',
      'button:has-text("Play")',
      '[data-testid="start-play"]',
      '[data-testid="run-play"]',
      '.play-button',
      '.start-button'
    ];

    let playButton = null;
    for (const selector of playButtons) {
      const button = await page.locator(selector).first();
      if (await button.isVisible()) {
        playButton = button;
        console.log(`✅ Found play button with selector: ${selector}`);
        break;
      }
    }

    if (playButton) {
      // Test multiple plays
      for (let playNum = 1; playNum <= 3; playNum++) {
        console.log(`🏈 Running play ${playNum}...`);
        
        await playButton.click();
        console.log(`✅ Started play ${playNum}`);
        
        // Wait for initial rush paths to develop
        await page.waitForTimeout(1000);
        await page.screenshot({ 
          path: `play-${playNum}-initial-rush.png`,
          fullPage: true 
        });
        
        // Wait for engagement phase (continuous hand fighting)
        await page.waitForTimeout(2000);
        await page.screenshot({ 
          path: `play-${playNum}-engagement.png`,
          fullPage: true 
        });
        
        // Wait for critical threshold phase (2.7-3.0s)
        await page.waitForTimeout(1500);
        await page.screenshot({ 
          path: `play-${playNum}-pressure.png`,
          fullPage: true 
        });
        
        // Wait for potential breakthrough
        await page.waitForTimeout(1000);
        await page.screenshot({ 
          path: `play-${playNum}-breakthrough.png`,
          fullPage: true 
        });
        
        console.log(`✅ Completed play ${playNum} testing`);
        await page.waitForTimeout(2000);
      }
    } else {
      console.log('⚠️ No play button found, trying field interaction...');
      
      // Try clicking on the field to start simulation
      await fieldElement.click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'field-interaction-test.png',
        fullPage: true 
      });
      
      // Wait to see if any animation starts
      await page.waitForTimeout(4000);
      
      await page.screenshot({ 
        path: 'field-interaction-result.png',
        fullPage: true 
      });
    }

    // Look specifically for DL elements and their movement
    console.log('🔍 Analyzing DL elements...');
    
    const dlSelectors = [
      '.dl-player',
      '[data-position*="DL"]',
      '[data-position*="DE"]', 
      '[data-position*="DT"]',
      '.defensive-line',
      '.purple-player',
      '[style*="purple"]'
    ];

    let dlElements = [];
    for (const selector of dlSelectors) {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        dlElements = dlElements.concat(elements);
        console.log(`✅ Found ${elements.length} DL elements with selector: ${selector}`);
      }
    }

    if (dlElements.length > 0) {
      console.log(`🎯 Total DL elements found: ${dlElements.length}`);
      await page.screenshot({ 
        path: 'dl-positions-analysis.png',
        fullPage: true 
      });
    } else {
      console.log('❌ No DL elements found');
    }

    // Check for console errors
    const logs = [];
    page.on('console', msg => {
      logs.push(`${msg.type()}: ${msg.text()}`);
    });

    await page.waitForTimeout(2000);

    // Final state screenshot
    console.log('📸 Taking final screenshot...');
    await page.screenshot({ 
      path: 'fluid-mechanics-final.png',
      fullPage: true 
    });

    console.log('✅ Testing completed!');
    console.log('📊 Console messages:', logs.slice(-10)); // Show last 10 messages

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Take error screenshot
    await page.screenshot({ 
      path: 'error-screenshot.png',
      fullPage: true 
    });
  } finally {
    await page.waitForTimeout(5000); // Keep browser open for manual inspection
    console.log('🏁 Test completed. Browser will close in 10 seconds...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
})();