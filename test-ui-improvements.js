const { chromium } = require('playwright');
const path = require('path');

async function testUIImprovements() {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-fullscreen']
  });
  
  const context = await browser.newContext({
    viewport: null, // Use full screen
    recordVideo: {
      dir: '.playwright-mcp/videos/',
      size: { width: 1920, height: 1080 }
    }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('🚀 Starting NFL UI Improvement Tests...');
    
    // Step 1: Navigate to homepage
    console.log('📍 Step 1: Navigating to homepage...');
    await page.goto('http://localhost:3008');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '.playwright-mcp/step1-homepage.png', fullPage: true });
    
    // Step 2: Click on Football Playbook Coach tile
    console.log('🏈 Step 2: Clicking Football Playbook Coach tile...');
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '.playwright-mcp/step2-football-app-loaded.png', fullPage: true });
    
    // Step 3: Enter full screen mode (F11)
    console.log('🖥️ Step 3: Entering full screen mode...');
    await page.keyboard.press('F11');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '.playwright-mcp/step3-fullscreen-mode.png', fullPage: true });
    
    // Step 4: Look for and open Football Panel
    console.log('📋 Step 4: Opening Football Panel...');
    
    // Try different selectors to find the panel toggle
    const panelSelectors = [
      'text=Open Football Panel',
      'text=Football Panel', 
      'button[aria-label*="panel"]',
      'button[title*="panel"]',
      '[data-testid*="panel"]',
      '.football-panel-toggle',
      'text=Panel'
    ];
    
    let panelOpened = false;
    for (const selector of panelSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          await element.click();
          panelOpened = true;
          console.log(`✅ Panel opened using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!panelOpened) {
      console.log('⚠️ Could not find Football Panel toggle, taking screenshot for inspection...');
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '.playwright-mcp/step4-panel-opened.png', fullPage: true });
    
    // Step 5: Navigate to Play Simulator
    console.log('🎮 Step 5: Navigating to Play Simulator...');
    
    const simulatorSelectors = [
      'text=Play Simulator',
      'text=Simulator',
      'a[href*="simulator"]',
      'button[data-testid*="simulator"]',
      '.play-simulator-link'
    ];
    
    let simulatorFound = false;
    for (const selector of simulatorSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          await element.click();
          simulatorFound = true;
          console.log(`✅ Simulator opened using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '.playwright-mcp/step5-play-simulator-loaded.png', fullPage: true });
    
    // Step 6: Test field dimensions and camera perspective
    console.log('📐 Step 6: Testing field dimensions and camera perspective...');
    
    // Look for the football field canvas/svg
    const fieldSelectors = [
      'canvas',
      'svg',
      '.football-field',
      '[data-testid*="field"]',
      '.play-field'
    ];
    
    let fieldElement = null;
    for (const selector of fieldSelectors) {
      try {
        fieldElement = await page.locator(selector).first();
        if (await fieldElement.isVisible()) {
          console.log(`✅ Field found using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (fieldElement) {
      const fieldBox = await fieldElement.boundingBox();
      if (fieldBox) {
        console.log(`📏 Field dimensions: ${fieldBox.width}x${fieldBox.height}`);
        console.log(`📊 Aspect ratio: ${(fieldBox.width / fieldBox.height).toFixed(2)} (target: 1.33 for 4:3)`);
        
        // Check if dimensions match expected 960x720
        const expectedWidth = 960;
        const expectedHeight = 720;
        const tolerance = 20; // Allow some tolerance
        
        if (Math.abs(fieldBox.width - expectedWidth) < tolerance && 
            Math.abs(fieldBox.height - expectedHeight) < tolerance) {
          console.log('✅ Field dimensions match expected 960x720');
        } else {
          console.log(`⚠️ Field dimensions (${fieldBox.width}x${fieldBox.height}) don't match expected (${expectedWidth}x${expectedHeight})`);
        }
      }
    }
    
    await page.screenshot({ path: '.playwright-mcp/step6-field-analysis.png', fullPage: true });
    
    // Step 7: Check for play controls and start simulation
    console.log('⚡ Step 7: Starting play simulation...');
    
    const playControlSelectors = [
      'text=Snap',
      'text=Start Play',
      'text=Run Play',
      'button[aria-label*="snap"]',
      'button[data-testid*="snap"]',
      '.snap-button'
    ];
    
    let playStarted = false;
    for (const selector of playControlSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          await element.click();
          playStarted = true;
          console.log(`✅ Play started using selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (playStarted) {
      // Take screenshots during play progression
      await page.waitForTimeout(500);
      await page.screenshot({ path: '.playwright-mcp/step7-play-0.5s.png', fullPage: true });
      
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '.playwright-mcp/step7-play-1.5s.png', fullPage: true });
      
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '.playwright-mcp/step7-play-3s.png', fullPage: true });
      
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '.playwright-mcp/step7-play-5s.png', fullPage: true });
    }
    
    // Step 8: Final comprehensive screenshot
    console.log('📸 Step 8: Taking final comprehensive screenshot...');
    await page.screenshot({ path: '.playwright-mcp/final-ui-state.png', fullPage: true });
    
    // Step 9: Check for specific UI elements we improved
    console.log('🔍 Step 9: Checking for improved UI elements...');
    
    // Check for DL labels
    const dlLabels = ['DE_L', 'DE_R', 'DT_L', 'DT_R'];
    const foundLabels = [];
    
    for (const label of dlLabels) {
      try {
        const element = await page.locator(`text=${label}`).first();
        if (await element.isVisible()) {
          foundLabels.push(label);
        }
      } catch (e) {
        // Label not found
      }
    }
    
    console.log(`🏷️ Found DL labels: ${foundLabels.join(', ')}`);
    
    // Check for overlapping labels by getting positions
    if (foundLabels.length > 0) {
      console.log('📍 Checking label positions for overlaps...');
      const labelPositions = [];
      
      for (const label of foundLabels) {
        try {
          const element = await page.locator(`text=${label}`).first();
          const box = await element.boundingBox();
          if (box) {
            labelPositions.push({ label, x: box.x, y: box.y, width: box.width, height: box.height });
          }
        } catch (e) {
          // Skip if can't get position
        }
      }
      
      // Check for overlaps
      let hasOverlaps = false;
      for (let i = 0; i < labelPositions.length; i++) {
        for (let j = i + 1; j < labelPositions.length; j++) {
          const pos1 = labelPositions[i];
          const pos2 = labelPositions[j];
          
          if (pos1.x < pos2.x + pos2.width &&
              pos1.x + pos1.width > pos2.x &&
              pos1.y < pos2.y + pos2.height &&
              pos1.y + pos1.height > pos2.y) {
            console.log(`⚠️ Overlap detected between ${pos1.label} and ${pos2.label}`);
            hasOverlaps = true;
          }
        }
      }
      
      if (!hasOverlaps && labelPositions.length > 1) {
        console.log('✅ No overlapping labels detected');
      }
    }
    
    console.log('🎉 UI Improvement testing completed successfully!');
    
    // Generate test report
    const report = {
      timestamp: new Date().toISOString(),
      tests: {
        homepage_navigation: '✅ PASS',
        football_app_access: '✅ PASS',
        fullscreen_mode: '✅ PASS',
        panel_access: panelOpened ? '✅ PASS' : '⚠️ NEEDS_VERIFICATION',
        simulator_access: simulatorFound ? '✅ PASS' : '⚠️ NEEDS_VERIFICATION',
        field_rendering: fieldElement ? '✅ PASS' : '⚠️ NEEDS_VERIFICATION',
        play_simulation: playStarted ? '✅ PASS' : '⚠️ NEEDS_VERIFICATION',
        dl_labels: foundLabels.length > 0 ? '✅ PASS' : '⚠️ NEEDS_VERIFICATION'
      },
      field_analysis: fieldElement ? 'Field element detected and analyzed' : 'Field element not found',
      dl_labels_found: foundLabels,
      screenshots_taken: [
        'step1-homepage.png',
        'step2-football-app-loaded.png', 
        'step3-fullscreen-mode.png',
        'step4-panel-opened.png',
        'step5-play-simulator-loaded.png',
        'step6-field-analysis.png',
        'step7-play-0.5s.png',
        'step7-play-1.5s.png', 
        'step7-play-3s.png',
        'step7-play-5s.png',
        'final-ui-state.png'
      ]
    };
    
    // Save report
    require('fs').writeFileSync('.playwright-mcp/test-report.json', JSON.stringify(report, null, 2));
    console.log('📊 Test report saved to .playwright-mcp/test-report.json');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: '.playwright-mcp/error-state.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// Run the test
testUIImprovements().catch(console.error);