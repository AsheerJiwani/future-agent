const { chromium } = require('playwright');

(async () => {
  console.log('🏈 Observing DL/OL Mechanics (Visual Analysis)...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500
  });
  
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:3009');
    await page.waitForTimeout(2000);

    // Navigate directly to the Football Playbook Coach
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(3000);

    // Take screenshot of current state
    await page.screenshot({ 
      path: 'dl-mechanics-analysis-1.png',
      fullPage: true 
    });

    console.log('✅ Captured initial state');

    // Try to force click the Run button using JavaScript execution
    await page.evaluate(() => {
      const runButton = document.querySelector('button:contains("Run"), [text*="Run"]');
      if (runButton) {
        runButton.click();
        return true;
      }
      
      // Try alternative selectors
      const buttons = Array.from(document.querySelectorAll('button'));
      const runBtn = buttons.find(btn => btn.textContent?.includes('Run'));
      if (runBtn) {
        runBtn.click();
        return true;
      }
      
      return false;
    });

    await page.waitForTimeout(1000);
    
    // Capture during potential animation
    await page.screenshot({ 
      path: 'dl-mechanics-analysis-2.png',
      fullPage: true 
    });

    console.log('✅ Attempted to trigger play');

    // Wait for animation phases
    for (let i = 1; i <= 5; i++) {
      await page.waitForTimeout(1000);
      await page.screenshot({ 
        path: `dl-mechanics-phase-${i}.png`,
        fullPage: true 
      });
      console.log(`✅ Captured phase ${i}`);
    }

    // Try clicking directly on field elements
    const fieldElement = await page.locator('svg, canvas, .field-container').first();
    if (await fieldElement.isVisible()) {
      console.log('🎯 Clicking on field to trigger interaction...');
      await fieldElement.click({ position: { x: 200, y: 300 } });
      
      await page.waitForTimeout(2000);
      await page.screenshot({ 
        path: 'dl-mechanics-field-click.png',
        fullPage: true 
      });
      
      // Wait for potential movement animation
      for (let i = 1; i <= 4; i++) {
        await page.waitForTimeout(1500);
        await page.screenshot({ 
          path: `dl-mechanics-movement-${i}.png`,
          fullPage: true 
        });
        console.log(`✅ Captured movement phase ${i}`);
      }
    }

    console.log('🔍 Analysis complete. Screenshots saved for manual review.');

  } catch (error) {
    console.error('❌ Error:', error);
    await page.screenshot({ 
      path: 'dl-mechanics-error.png',
      fullPage: true 
    });
  } finally {
    console.log('🏁 Keeping browser open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    await browser.close();
  }
})();