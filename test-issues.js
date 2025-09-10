const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🔍 Investigating Football Simulator Issues...');
  
  try {
    // Navigate to the site
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'screenshots/01-initial.png', fullPage: true });
    console.log('✓ Initial screenshot taken');
    
    // Click on Football Playbook Coach
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(3000);
    
    // Take screenshot after opening football panel
    await page.screenshot({ path: 'screenshots/02-football-opened.png', fullPage: true });
    console.log('✓ Football panel opened screenshot taken');
    
    // Test 1: Check if layout mode toggles exist and work
    console.log('\n🧪 Testing Layout Mode Toggles...');
    
    const studyButton = await page.locator('text=📚 Study').first();
    const practiceButton = await page.locator('text=🎯 Practice').first();
    const coachButton = await page.locator('text=👨‍🏫 Coach').first();
    
    console.log('Study button exists:', await studyButton.count() > 0);
    console.log('Practice button exists:', await practiceButton.count() > 0);
    console.log('Coach button exists:', await coachButton.count() > 0);
    
    if (await practiceButton.count() > 0) {
      await practiceButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/03-practice-mode.png', fullPage: true });
      console.log('✓ Practice mode screenshot taken');
    }
    
    if (await coachButton.count() > 0) {
      await coachButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/04-coach-mode.png', fullPage: true });
      console.log('✓ Coach mode screenshot taken');
    }
    
    if (await studyButton.count() > 0) {
      await studyButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/05-study-mode.png', fullPage: true });
      console.log('✓ Study mode screenshot taken');
    }
    
    // Test 2: Check Reset button functionality
    console.log('\n🧪 Testing Reset Button...');
    
    const resetButton = await page.locator('text=🔄 RESET').first();
    console.log('Reset button exists:', await resetButton.count() > 0);
    
    if (await resetButton.count() > 0) {
      // Add event listener to check if reset event is dispatched
      await page.evaluate(() => {
        window.resetEventFired = false;
        window.addEventListener('reset-play', () => {
          window.resetEventFired = true;
        });
      });
      
      await resetButton.click();
      await page.waitForTimeout(500);
      
      const eventFired = await page.evaluate(() => window.resetEventFired);
      console.log('Reset event fired:', eventFired);
    }
    
    // Test 3: Check Performance overlay positioning
    console.log('\n🧪 Testing Performance Overlay...');
    
    const performanceWidget = await page.locator('[class*="absolute"][class*="top-4"][class*="left-4"]').first();
    console.log('Performance widget exists:', await performanceWidget.count() > 0);
    
    if (await performanceWidget.count() > 0) {
      const bbox = await performanceWidget.boundingBox();
      console.log('Performance widget position:', bbox);
      
      // Check if it overlaps with control buttons
      const snapButton = await page.locator('text=🏈 SNAP').first();
      if (await snapButton.count() > 0) {
        const snapBbox = await snapButton.boundingBox();
        console.log('Snap button position:', snapBbox);
        
        // Check for overlap
        if (bbox && snapBbox) {
          const overlap = !(bbox.x + bbox.width < snapBbox.x || 
                           snapBbox.x + snapBbox.width < bbox.x || 
                           bbox.y + bbox.height < snapBbox.y || 
                           snapBbox.y + snapBbox.height < bbox.y);
          console.log('Performance widget overlaps with controls:', overlap);
        }
      }
    }
    
    // Final screenshot
    await page.screenshot({ path: 'screenshots/06-final-state.png', fullPage: true });
    console.log('✓ Final screenshot taken');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
  }
  
  console.log('\n📋 Test complete. Check screenshots/ directory for evidence.');
  // Keep browser open for manual inspection
  console.log('🔍 Browser will remain open for manual inspection...');
  
})().catch(console.error);