const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('📸 Taking screenshots to document current UI state...');
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Click Football tile
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(2000);
    
    // Take screenshot of initial state (Study mode)
    await page.screenshot({ path: 'screenshots/01-study-mode.png', fullPage: true });
    console.log('✓ Study mode screenshot saved');
    
    // Check if Control Center is visible
    const controlCenter = await page.locator('.w-72, [class*="w-72"]');
    console.log('✓ Control Center visible in Study mode:', await controlCenter.count() > 0);
    
    // Switch to Practice mode
    const practiceBtn = await page.locator('text=Practice').first();
    if (await practiceBtn.count() > 0) {
      await practiceBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/02-practice-mode.png', fullPage: true });
      console.log('✓ Practice mode screenshot saved');
    }
    
    // Switch to Coach mode
    const coachBtn = await page.locator('text=Coach').first();
    if (await coachBtn.count() > 0) {
      await coachBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/03-coach-mode.png', fullPage: true });
      console.log('✓ Coach mode screenshot saved');
      
      // Check if Control Center is still visible in Coach mode
      const controlCenterCoach = await page.locator('.w-72, [class*="w-72"]');
      console.log('✓ Control Center visible in Coach mode:', await controlCenterCoach.count() > 0);
    }
    
    // Switch back to Study mode to check Control Center
    const studyBtn = await page.locator('text=Study').first();
    if (await studyBtn.count() > 0) {
      await studyBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/04-study-mode-return.png', fullPage: true });
      console.log('✓ Study mode return screenshot saved');
      
      // Check if Control Center is still visible after returning to Study
      const controlCenterReturn = await page.locator('.w-72, [class*="w-72"]');
      console.log('✓ Control Center visible after return to Study:', await controlCenterReturn.count() > 0);
    }
    
    // Look for Performance widget
    const performanceWidget = await page.locator('text=Performance');
    console.log('✓ Performance widget found:', await performanceWidget.count());
    if (await performanceWidget.count() > 0) {
      const box = await performanceWidget.first().boundingBox();
      console.log('✓ Performance widget position:', box);
    }
    
    // Look for overlapping elements
    const playSimulator = await page.locator('[class*="theme-football"]');
    console.log('✓ PlaySimulator container found:', await playSimulator.count() > 0);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('📸 Screenshot test complete - browser kept open for inspection...');
  
})().catch(console.error);