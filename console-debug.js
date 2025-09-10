const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('🐛 Debugging console messages...');
  
  // Listen to all console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`📟 Console [${type.toUpperCase()}]:`, text);
  });
  
  // Listen to page errors
  page.on('pageerror', error => {
    console.log('💥 Page Error:', error.message);
  });
  
  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    console.log('🏈 Clicking Football tile...');
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(2000);
    
    console.log('📚 In Study mode - waiting for any errors...');
    await page.waitForTimeout(1000);
    
    console.log('👨‍🏫 Switching to Coach mode...');
    const coachBtn = await page.locator('text=Coach').first();
    if (await coachBtn.count() > 0) {
      await coachBtn.click();
      console.log('🔄 Coach button clicked - waiting for render...');
      await page.waitForTimeout(3000); // Wait longer to see if it eventually renders
      
      // Check if the component exists now
      const themeFootball = await page.locator('.theme-football').count();
      console.log('✅ theme-football containers found:', themeFootball);
      
      const controlCenter = await page.locator('.w-72').count();
      console.log('✅ Control Center containers found:', controlCenter);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  console.log('🐛 Console debug complete - browser kept open...');
  
})().catch(console.error);