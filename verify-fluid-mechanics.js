const { chromium } = require('playwright');

(async () => {
  console.log('🏈 FINAL FLUID DL/OL MECHANICS VERIFICATION');
  console.log('===========================================');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 300,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  try {
    console.log('1. ✅ Navigating to Football Playbook Coach...');
    await page.goto('http://localhost:3009');
    await page.waitForTimeout(2000);

    // Click Football Playbook Coach
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(2000);
    
    console.log('2. ✅ Entering full screen mode (F11)...');
    await page.keyboard.press('F11');
    await page.waitForTimeout(5000); // Required 5-second wait
    
    console.log('3. ✅ Taking initial field screenshot...');
    await page.screenshot({ 
      path: 'verification-initial-field.png',
      fullPage: true 
    });

    // Analyze what we can see in the current state
    console.log('4. 🔍 Analyzing current DL positions...');
    
    // Look for DL elements (purple players)
    const dlElements = await page.$$('[data-position*="DL"], [data-position*="DE"], [data-position*="DT"], .dl-player, [style*="purple"]');
    console.log(`   Found ${dlElements.length} potential DL elements`);
    
    // Try to find the run/start button
    const runButtons = await page.$$('button:has-text("Run"), button:has-text("Start"), button:has-text("Play")');
    console.log(`   Found ${runButtons.length} potential run buttons`);
    
    if (runButtons.length > 0) {
      console.log('5. ⚡ Attempting to start play...');
      
      // Try force clicking using JavaScript
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const runBtn = buttons.find(btn => 
          btn.textContent?.includes('Run') || 
          btn.textContent?.includes('Start') || 
          btn.textContent?.includes('Play')
        );
        if (runBtn) {
          runBtn.scrollIntoView();
          runBtn.click();
          return true;
        }
        return false;
      });
      
      console.log('6. ⏱️ Monitoring DL movement phases...');
      
      // Capture movement at key intervals
      const phases = [
        { time: 500, name: 'snap-to-contact', desc: 'Initial rush (0.5s)' },
        { time: 1500, name: 'early-engagement', desc: 'Early engagement (1.5s)' },
        { time: 2500, name: 'late-engagement', desc: 'Late engagement (2.5s)' },
        { time: 3000, name: 'critical-threshold', desc: 'Critical threshold (3.0s)' },
        { time: 4000, name: 'breakthrough', desc: 'Breakthrough phase (4.0s)' }
      ];
      
      for (const phase of phases) {
        await page.waitForTimeout(phase.time);
        await page.screenshot({ 
          path: `verification-${phase.name}.png`,
          fullPage: true 
        });
        console.log(`   ✅ Captured ${phase.desc}`);
      }
      
    } else {
      console.log('5. ⚠️ No run button found, trying field interaction...');
      
      // Try clicking on field to see if it triggers any movement
      const fieldElement = await page.$('svg, canvas, .field-container');
      if (fieldElement) {
        await fieldElement.click({ position: { x: 250, y: 400 } });
        console.log('   ✅ Clicked on field');
        
        // Wait and capture potential movement
        for (let i = 1; i <= 5; i++) {
          await page.waitForTimeout(1000);
          await page.screenshot({ 
            path: `verification-field-interaction-${i}.png`,
            fullPage: true 
          });
          console.log(`   ✅ Captured field interaction phase ${i}`);
        }
      }
    }
    
    console.log('7. 📊 MECHANICS ANALYSIS COMPLETE');
    console.log('   Screenshots saved for manual review of:');
    console.log('   - Curved rush paths vs straight lines');
    console.log('   - Technique-specific movements (9-tech vs 3-tech)');
    console.log('   - Hand fighting oscillations');
    console.log('   - Gradual pressure escalation');
    console.log('   - Realistic pursuit angles');
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
    await page.screenshot({ 
      path: 'verification-error.png',
      fullPage: true 
    });
  } finally {
    console.log('8. 🏁 Verification complete. Review screenshots to assess fluid mechanics.');
    console.log('   Browser will remain open for manual inspection...');
    await page.waitForTimeout(30000); // Keep open for manual review
    await browser.close();
  }
})();