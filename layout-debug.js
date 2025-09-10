const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🏗️ Debugging layout structure...');
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Click Football tile
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(2000);
    
    // Log the DOM structure in Study mode
    console.log('📍 STUDY MODE DOM Structure:');
    const studyHTML = await page.evaluate(() => {
      const themeFootball = document.querySelector('.theme-football');
      return themeFootball ? themeFootball.outerHTML.substring(0, 1000) + '...' : 'Not found';
    });
    console.log(studyHTML);
    
    // Switch to Coach mode and log DOM structure
    const coachBtn = await page.locator('text=Coach').first();
    if (await coachBtn.count() > 0) {
      await coachBtn.click();
      await page.waitForTimeout(1000);
      
      console.log('📍 COACH MODE DOM Structure:');
      const coachHTML = await page.evaluate(() => {
        const themeFootball = document.querySelector('.theme-football');
        return themeFootball ? themeFootball.outerHTML.substring(0, 1000) + '...' : 'Not found';
      });
      console.log(coachHTML);
      
      // Check if the Control Center container exists but is hidden
      const w72Elements = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="w-72"]');
        return Array.from(elements).map(el => ({
          class: el.className,
          visible: el.offsetParent !== null,
          display: window.getComputedStyle(el).display,
          position: window.getComputedStyle(el).position
        }));
      });
      console.log('📍 w-72 elements in Coach mode:', w72Elements);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('🏗️ Layout debug complete - browser kept open...');
  
})().catch(console.error);