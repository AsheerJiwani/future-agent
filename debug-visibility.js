const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🔍 Debugging Control Center visibility...');
  
  try {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');
    
    // Click Football tile
    console.log('🏈 Clicking Football Playbook Coach...');
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(3000);
    
    // Check if the Control Center div exists and its properties
    const controlCenterInfo = await page.evaluate(() => {
      const controlCenter = document.querySelector('.w-72');
      if (!controlCenter) return { exists: false };
      
      const styles = window.getComputedStyle(controlCenter);
      const rect = controlCenter.getBoundingClientRect();
      
      return {
        exists: true,
        isVisible: controlCenter.offsetParent !== null,
        display: styles.display,
        visibility: styles.visibility,
        opacity: styles.opacity,
        width: styles.width,
        height: styles.height,
        position: styles.position,
        zIndex: styles.zIndex,
        backgroundColor: styles.backgroundColor,
        boundingRect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom
        },
        innerHTML: controlCenter.innerHTML.substring(0, 200) + '...',
        classList: Array.from(controlCenter.classList),
        parent: {
          tagName: controlCenter.parentElement?.tagName,
          classList: controlCenter.parentElement ? Array.from(controlCenter.parentElement.classList) : []
        }
      };
    });
    
    console.log('📊 Control Center Analysis:');
    console.log(JSON.stringify(controlCenterInfo, null, 2));
    
    // Also check the parent container
    const parentInfo = await page.evaluate(() => {
      const themeFootball = document.querySelector('.theme-football');
      if (!themeFootball) return { exists: false };
      
      const styles = window.getComputedStyle(themeFootball);
      const rect = themeFootball.getBoundingClientRect();
      
      return {
        exists: true,
        display: styles.display,
        overflow: styles.overflow,
        height: styles.height,
        boundingRect: {
          width: rect.width,
          height: rect.height
        }
      };
    });
    
    console.log('📊 Theme Football Container:');
    console.log(JSON.stringify(parentInfo, null, 2));
    
    // Take a screenshot for visual confirmation
    await page.screenshot({ path: 'screenshots/debug-visibility.png', fullPage: true });
    console.log('📸 Debug screenshot saved');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('🔍 Debug complete - browser kept open...');
  
})().catch(console.error);