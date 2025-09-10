const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🧪 Simple test after cache clear...');
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    console.log('✓ Page loaded');
    
    // Find and click the football tile
    const footballTile = await page.locator('text=Football Playbook Coach');
    console.log('✓ Football tile found:', await footballTile.count() > 0);
    
    if (await footballTile.count() > 0) {
      await footballTile.click();
      console.log('✓ Football tile clicked');
      
      // Wait for panel to appear
      await page.waitForTimeout(2000);
      
      // Check if panel is visible
      const panel = await page.locator('#football-panel');
      console.log('✓ Football panel element exists:', await panel.count() > 0);
      
      // Check if FootballPanel component rendered
      const content = await page.locator('.theme-football');
      console.log('✓ Football theme content exists:', await content.count() > 0);
      
      if (await content.count() > 0) {
        // Look for our new elements
        const snapBtn = await page.locator('text=SNAP');
        const resetBtn = await page.locator('text=RESET'); 
        const studyBtn = await page.locator('text=Study');
        const practiceBtn = await page.locator('text=Practice');
        const coachBtn = await page.locator('text=Coach');
        
        console.log('✓ SNAP button found:', await snapBtn.count());
        console.log('✓ RESET button found:', await resetBtn.count());
        console.log('✓ Study button found:', await studyBtn.count());
        console.log('✓ Practice button found:', await practiceBtn.count());
        console.log('✓ Coach button found:', await coachBtn.count());
        
        // Take screenshot
        await page.screenshot({ path: 'screenshots/working-test.png', fullPage: true });
        console.log('📸 Screenshot saved');
        
        // Test clicking reset button
        if (await resetBtn.count() > 0) {
          console.log('🧪 Testing reset button click...');
          await resetBtn.first().click();
          console.log('✓ Reset button clicked');
        }
        
        // Test layout mode switching
        if (await practiceBtn.count() > 0) {
          console.log('🧪 Testing practice mode...');
          await practiceBtn.first().click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: 'screenshots/practice-mode.png', fullPage: true });
          console.log('✓ Practice mode activated');
        }
        
      } else {
        console.log('❌ FootballPanel content not rendered');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('✅ Test complete - browser kept open');
  
})().catch(console.error);