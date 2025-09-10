const { chromium } = require('playwright');

(async () => {
  // Launch browser
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('1. Navigating to localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  // Take initial screenshot
  await page.screenshot({ path: '.playwright-mcp/initial-page-load.png' });
  console.log('✓ Initial screenshot taken');
  
  // Click on Football Playbook Coach tile
  console.log('2. Clicking on Football Playbook Coach tile...');
  const footballTile = await page.locator('text=Football Playbook Coach').first();
  await footballTile.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Dismiss any modals or overlays
  try {
    // Look for close buttons, escape key, or clicking outside modals
    const closeButton = await page.locator('button:has-text("×"), button[aria-label="Close"], .modal-close').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    // Try pressing escape to dismiss modals
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }
  
  // Click outside any potential modals to dismiss them
  await page.click('body', { position: { x: 50, y: 50 } });
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '.playwright-mcp/football-panel-opened.png' });
  console.log('✓ Football simulator opened');
  
  // Look for Football Panel button or section
  console.log('3. Looking for simulation controls...');
  
  // Try to find and click football panel button
  let footballPanelVisible = false;
  try {
    // Check if panel is already visible
    const panel = await page.locator('text=Football').first();
    if (await panel.isVisible()) {
      footballPanelVisible = true;
      console.log('✓ Football panel already visible');
    } else {
      // Try to find a button to open it
      const openButton = await page.locator('button:has-text("Football"), button:has-text("Open Panel"), [data-testid="football-panel-toggle"]').first();
      if (await openButton.isVisible()) {
        await openButton.click();
        await page.waitForTimeout(1000);
        footballPanelVisible = true;
        console.log('✓ Football panel opened');
      }
    }
  } catch (e) {
    console.log('Football panel not found, looking for simulation elements...');
  }
  
  await page.screenshot({ path: '.playwright-mcp/page-without-football-panel.png' });
  
  // Look for play simulation controls
  console.log('4. Looking for play simulation controls...');
  let simulationStarted = false;
  
  try {
    // Look for various possible start simulation buttons
    const startButton = await page.locator('button:has-text("Start"), button:has-text("Simulate"), button:has-text("Run Play"), button:has-text("Play"), [data-testid="start-simulation"]').first();
    
    if (await startButton.isVisible()) {
      console.log('✓ Found start simulation button');
      
      // Dismiss any remaining modals before taking screenshots
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
      // Take pre-snap screenshot
      await page.screenshot({ path: '.playwright-mcp/pre-snap-positioning.png' });
      console.log('✓ Pre-snap screenshot taken');
      
      // Start the simulation
      await startButton.click();
      simulationStarted = true;
      console.log('✓ Simulation started');
      
      // Wait and take screenshots at key intervals
      console.log('5. Capturing post-snap progression...');
      
      // 1 second post-snap - DL should be held back
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/focused-pocket-1s.png' });
      console.log('✓ 1s post-snap screenshot taken');
      
      // 2 seconds post-snap - DL still held back
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/focused-pocket-2s.png' });
      console.log('✓ 2s post-snap screenshot taken');
      
      // 3 seconds post-snap - DL should start breaking through
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/focused-pocket-3s.png' });
      console.log('✓ 3s post-snap screenshot taken');
      
      // 4 seconds post-snap - DL breakthrough
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/focused-pocket-4s.png' });
      console.log('✓ 4s post-snap screenshot taken');
      
    } else {
      console.log('Start simulation button not found');
    }
  } catch (e) {
    console.log('Error with simulation:', e.message);
  }
  
  // Take a final screenshot of current state
  await page.screenshot({ path: '.playwright-mcp/current-state.png' });
  console.log('✓ Final screenshot taken');
  
  console.log('6. Test complete - screenshots saved to .playwright-mcp/ directory');
  
  // Keep browser open for 5 seconds to allow manual inspection
  console.log('Keeping browser open for manual inspection...');
  await page.waitForTimeout(5000);
  
  await browser.close();
})();