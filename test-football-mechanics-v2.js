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
  await page.waitForTimeout(3000);
  
  // Try to close any modals by pressing Escape multiple times and clicking outside
  console.log('3. Dismissing any modals...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Click in the top-left corner to dismiss modals
  await page.click('body', { position: { x: 10, y: 10 } });
  await page.waitForTimeout(1000);
  
  // Take screenshot after modal dismissal
  await page.screenshot({ path: '.playwright-mcp/after-modal-dismissal.png' });
  console.log('✓ Screenshot after modal dismissal');
  
  // Look specifically for the football field canvas or SVG
  console.log('4. Looking for football field...');
  
  // Try to find the field element and take a focused screenshot
  try {
    const fieldArea = await page.locator('canvas, svg, .field, .football-field, [data-testid="football-field"]').first();
    
    if (await fieldArea.isVisible()) {
      console.log('✓ Found football field element');
      
      // Take a screenshot focused on the field area
      const fieldBox = await fieldArea.boundingBox();
      if (fieldBox) {
        await page.screenshot({ 
          path: '.playwright-mcp/field-focused.png',
          clip: {
            x: fieldBox.x,
            y: fieldBox.y,
            width: fieldBox.width,
            height: fieldBox.height
          }
        });
        console.log('✓ Field-focused screenshot taken');
      }
    }
  } catch (e) {
    console.log('Field element not found:', e.message);
  }
  
  // Look for simulation controls
  console.log('5. Looking for simulation controls...');
  
  try {
    // Look for Snap button specifically
    const snapButton = await page.locator('button:has-text("Snap"), .snap-button, [data-testid="snap"]').first();
    
    if (await snapButton.isVisible()) {
      console.log('✓ Found Snap button');
      
      // Take pre-snap screenshot
      await page.screenshot({ path: '.playwright-mcp/pre-snap-state.png' });
      console.log('✓ Pre-snap screenshot taken');
      
      // Click the snap button to start simulation
      await snapButton.click();
      console.log('✓ Snap button clicked - simulation started');
      
      // Take rapid screenshots during the simulation
      console.log('6. Capturing simulation progression...');
      
      // Immediate post-snap (0.5s)
      await page.waitForTimeout(500);
      await page.screenshot({ path: '.playwright-mcp/post-snap-0.5s.png' });
      console.log('✓ 0.5s post-snap screenshot');
      
      // 1 second post-snap - OL should be engaged with DL
      await page.waitForTimeout(500);
      await page.screenshot({ path: '.playwright-mcp/post-snap-1s.png' });
      console.log('✓ 1s post-snap screenshot');
      
      // 2 seconds post-snap - pocket should be holding
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/post-snap-2s.png' });
      console.log('✓ 2s post-snap screenshot');
      
      // 3 seconds post-snap - DL may start breaking through
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/post-snap-3s.png' });
      console.log('✓ 3s post-snap screenshot');
      
      // 4 seconds post-snap - pocket should be collapsing
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/post-snap-4s.png' });
      console.log('✓ 4s post-snap screenshot');
      
    } else {
      console.log('Snap button not found - checking other controls');
      
      // Look for other possible control buttons
      const playButton = await page.locator('button:has-text("Play"), button:has-text("Start"), button:has-text("Run")').first();
      if (await playButton.isVisible()) {
        console.log('✓ Found alternative play button');
        await playButton.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '.playwright-mcp/alternative-simulation.png' });
        console.log('✓ Alternative simulation screenshot');
      }
    }
  } catch (e) {
    console.log('Error with simulation controls:', e.message);
  }
  
  // Take final screenshot of current state
  await page.screenshot({ path: '.playwright-mcp/final-state.png' });
  console.log('✓ Final screenshot taken');
  
  console.log('7. Test complete - screenshots saved to .playwright-mcp/ directory');
  
  // Keep browser open for manual inspection
  console.log('Keeping browser open for 10 seconds for manual inspection...');
  await page.waitForTimeout(10000);
  
  await browser.close();
})();