const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('📸 Taking screenshot of current UI...');
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of homepage
    await page.screenshot({ path: 'screenshots/homepage.png', fullPage: true });
    console.log('✓ Homepage screenshot saved');
    
    // Click Football tile
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(3000);
    
    // Take screenshot of Football panel
    await page.screenshot({ path: 'screenshots/football-panel.png', fullPage: true });
    console.log('✓ Football panel screenshot saved');
    
    // Check if Control Center elements are visible
    const gameControls = await page.locator('text=🏈 GAME CONTROLS');
    console.log('✓ Game Controls found:', await gameControls.count());
    
    const w72Elements = await page.locator('.w-72');
    console.log('✓ w-72 elements found:', await w72Elements.count());
    
    const essential = await page.locator('text=Essential');
    console.log('✓ Essential section found:', await essential.count());
    
    // Check what Coach button exists
    const coachButtons = await page.locator('text=Coach');
    console.log('✓ Coach buttons found:', await coachButtons.count());
    
    if (await coachButtons.count() > 0) {
      const coachText = await coachButtons.first().textContent();
      console.log('✓ Coach button text:', coachText);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('📸 Screenshot test complete - browser kept open...');
  
})().catch(console.error);