const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🔍 Debugging Control Center visibility...');
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Click Football tile
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(2000);
    
    // Test different selectors for Control Center
    const selectors = [
      '.w-72',
      '[class*="w-72"]',
      'text=🏈 GAME CONTROLS',
      'text=GAME CONTROLS',
      'text=Essential',
      'text=PLAY CONCEPT'
    ];
    
    console.log('📍 Study mode - checking Control Center selectors:');
    for (const selector of selectors) {
      const count = await page.locator(selector).count();
      console.log(`  ${selector}: ${count} found`);
    }
    
    // Switch to Coach mode
    const coachBtn = await page.locator('text=Coach').first();
    if (await coachBtn.count() > 0) {
      await coachBtn.click();
      await page.waitForTimeout(1000);
      
      console.log('📍 Coach mode - checking Control Center selectors:');
      for (const selector of selectors) {
        const count = await page.locator(selector).count();
        console.log(`  ${selector}: ${count} found`);
      }
      
      // Check if elements are hidden by CSS
      const gameControls = await page.locator('text=🏈 GAME CONTROLS').first();
      if (await gameControls.count() > 0) {
        const isVisible = await gameControls.isVisible();
        const boundingBox = await gameControls.boundingBox();
        console.log('  🏈 GAME CONTROLS element:');
        console.log('    isVisible:', isVisible);
        console.log('    boundingBox:', boundingBox);
      }
      
      // Check layout mode value
      await page.evaluate(() => {
        console.log('Layout mode from DOM:', window.document.body.innerHTML.includes('COACH'));
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('🔍 Debug test complete - browser kept open...');
  
})().catch(console.error);