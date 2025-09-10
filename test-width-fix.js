const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🔧 Testing width fix...');
  
  try {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');
    
    console.log('🏈 Clicking Football Playbook Coach...');
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(2000);
    
    // Check the Control Center width now
    const widthInfo = await page.evaluate(() => {
      const controlCenter = document.querySelector('[style*="width: 288px"]');
      if (!controlCenter) return { found: false };
      
      const styles = window.getComputedStyle(controlCenter);
      const rect = controlCenter.getBoundingClientRect();
      
      return {
        found: true,
        computedWidth: styles.width,
        boundingWidth: rect.width,
        isVisible: controlCenter.offsetParent !== null,
        left: rect.left,
        right: rect.right
      };
    });
    
    console.log('📏 Width Analysis:', JSON.stringify(widthInfo, null, 2));
    
    // Check if SNAP and RESET buttons are now visible
    const buttonsVisible = await page.evaluate(() => {
      const snapBtn = document.querySelector('button:has-text("SNAP")');
      const resetBtn = document.querySelector('button:has-text("RESET")');
      
      return {
        snapFound: !!snapBtn,
        resetFound: !!resetBtn,
        snapVisible: snapBtn ? snapBtn.offsetParent !== null : false,
        resetVisible: resetBtn ? resetBtn.offsetParent !== null : false
      };
    });
    
    console.log('🔘 Button Visibility:', JSON.stringify(buttonsVisible, null, 2));
    
    await page.screenshot({ path: 'screenshots/width-fix-test.png', fullPage: true });
    console.log('📸 Width fix screenshot saved');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('🔧 Width fix test complete - browser kept open...');
  
})().catch(console.error);