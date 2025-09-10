const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🔍 Debugging Football Panel Issues...');
  
  try {
    // Navigate and wait
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // Click Football Playbook Coach
    console.log('📌 Clicking Football Playbook Coach...');
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(3000);
    
    // Check if FootballPanel rendered
    const footballPanel = await page.locator('.theme-football');
    console.log('✓ Football panel rendered:', await footballPanel.count() > 0);
    
    if (await footballPanel.count() > 0) {
      // Look for any elements with specific classes
      const leftSidebar = await page.locator('.w-72, [class*="w-72"]');
      console.log('✓ Left sidebar found:', await leftSidebar.count() > 0);
      
      const snapButtons = await page.locator('text=SNAP, text=Snap');
      console.log('✓ Snap buttons found:', await snapButtons.count());
      
      const resetButtons = await page.locator('text=RESET, text=Reset');
      console.log('✓ Reset buttons found:', await resetButtons.count());
      
      const layoutToggles = await page.locator('text=Study, text=Practice, text=Coach');
      console.log('✓ Layout toggles found:', await layoutToggles.count());
      
      // Get all visible text content
      const allText = await page.textContent('body');
      console.log('✓ Page contains "Study":', allText.includes('Study'));
      console.log('✓ Page contains "Practice":', allText.includes('Practice'));
      console.log('✓ Page contains "Coach":', allText.includes('Coach'));
      console.log('✓ Page contains "SNAP":', allText.includes('SNAP'));
      console.log('✓ Page contains "RESET":', allText.includes('RESET'));
      
      // Check for console errors
      const logs = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          logs.push(msg.text());
        }
      });
      
      await page.waitForTimeout(2000);
      
      if (logs.length > 0) {
        console.log('❌ Console errors found:');
        logs.forEach(log => console.log('  -', log));
      } else {
        console.log('✅ No console errors');
      }
      
      // Take detailed screenshot
      await page.screenshot({ path: 'screenshots/debug-detailed.png', fullPage: true });
      console.log('📸 Detailed screenshot saved');
      
      // Try to find elements by more specific selectors
      const gameControls = await page.locator('[class*="GAME CONTROLS"], text="GAME CONTROLS"');
      console.log('✓ Game controls header found:', await gameControls.count() > 0);
      
      const essentialSection = await page.locator('text="Essential", text="ESSENTIAL"');
      console.log('✓ Essential section found:', await essentialSection.count() > 0);
      
    } else {
      console.log('❌ Football panel not rendered - checking for errors...');
      
      // Check console for errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log('Console error:', msg.text());
        }
      });
      
      await page.waitForTimeout(2000);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
  
  console.log('\n🎯 Debug test complete. Browser kept open for inspection...');
  
})().catch(console.error);