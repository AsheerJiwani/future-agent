const { chromium } = require('playwright');

async function verifyOLDLPositioning() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('2. Clicking on Football Playbook Coach card...');
    
    // Look for the Football Playbook Coach card
    const footballCard = page.locator('text="Football Playbook Coach"').first();
    await footballCard.waitFor({ state: 'visible', timeout: 10000 });
    
    // Click on the card (not just the text, but the whole card area)
    const cardContainer = footballCard.locator('..').first(); // Get parent container
    await cardContainer.click();
    
    // Wait for navigation
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('3. Entering full screen mode and waiting 5 seconds...');
    await page.keyboard.press('F11');
    await page.waitForTimeout(5000);

    console.log('4. Looking for Football Panel or navigation elements...');
    
    // Take a screenshot to see what's available after entering the Football app
    await page.screenshot({ path: 'after-entering-football-app.png', fullPage: true });
    
    // Look for Football Panel, Play Simulator, or other navigation elements
    const navigationSelectors = [
      'text="Football Panel"',
      'text="Play Simulator"', 
      'text="Simulator"',
      'button:has-text("Football")',
      'button:has-text("Panel")',
      'button:has-text("Play")',
      'button:has-text("Simulator")',
      '[data-testid*="panel"]',
      '[data-testid*="simulator"]',
      'nav button',
      '.nav button',
      'header button'
    ];
    
    let navigationFound = false;
    for (const selector of navigationSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`Found ${elements.length} navigation elements with selector: ${selector}`);
          for (let i = 0; i < elements.length; i++) {
            const text = await elements[i].textContent();
            console.log(`  Element ${i + 1}: "${text?.trim()}"`);
            
            // Click on the first relevant element
            if (!navigationFound && (
              text?.toLowerCase().includes('football') ||
              text?.toLowerCase().includes('panel') ||
              text?.toLowerCase().includes('play') ||
              text?.toLowerCase().includes('simulator')
            )) {
              await elements[i].click();
              navigationFound = true;
              console.log(`Clicked on: "${text?.trim()}"`);
              await page.waitForTimeout(2000);
              break;
            }
          }
          if (navigationFound) break;
        }
      } catch (e) {
        console.log(`No elements found for selector: ${selector}`);
      }
    }

    console.log('5. Looking for Play Simulator interface...');
    await page.waitForTimeout(2000);
    
    // Look for Play Simulator elements
    const simulatorSelectors = [
      '[data-testid="play-simulator"]',
      '[data-testid="field-root"]',
      'svg[data-testid*="field"]',
      'canvas',
      '.field',
      '.simulator',
      '.football-field',
      'svg'
    ];
    
    let fieldFound = false;
    for (const selector of simulatorSelectors) {
      try {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          console.log(`Found ${elements.length} field/simulator elements with selector: ${selector}`);
          fieldFound = true;
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    if (!fieldFound) {
      console.log('Field not found. Looking for any clickable elements that might lead to the simulator...');
      const allButtons = await page.locator('button, [role="button"], .btn, a').all();
      for (const button of allButtons) {
        try {
          const text = await button.textContent();
          if (text && text.trim().length > 0) {
            console.log(`  Available button: "${text.trim()}"`);
          }
        } catch (e) {
          // Skip
        }
      }
    }

    console.log('6. Taking final screenshot for OL/DL positioning verification...');
    await page.screenshot({ 
      path: 'ol-dl-positioning-final.png', 
      fullPage: true 
    });

    console.log('7. Analyzing field elements and player positions...');
    
    // Look for offensive line elements
    const olSelectors = [
      '[data-testid*="ol"]',
      '[data-testid*="offensive"]',
      '[data-position="ol"]',
      '[data-position="center"]',
      '[data-position="guard"]',
      '[data-position="tackle"]',
      'circle[fill*="blue"]', // Assuming offensive players are blue
      '.ol-player',
      '.offensive-line',
      '[class*="offensive"]'
    ];
    
    // Look for defensive line elements  
    const dlSelectors = [
      '[data-testid*="dl"]',
      '[data-testid*="defensive"]',
      '[data-position="dl"]',
      '[data-position="de"]',
      '[data-position="dt"]',
      'circle[fill*="red"]', // Assuming defensive players are red
      '.dl-player',
      '.defensive-line',
      '[class*="defensive"]'
    ];
    
    // Look for line of scrimmage
    const losSelectors = [
      '[data-testid*="los"]',
      '[data-testid*="scrimmage"]',
      'line[stroke*="yellow"]',
      'line[stroke*="white"]',
      '.line-of-scrimmage',
      '[class*="scrimmage"]'
    ];
    
    const positions = {
      ol: [],
      dl: [],
      los: []
    };
    
    console.log('\nAnalyzing Offensive Line positions...');
    for (const selector of olSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const element of elements) {
          const box = await element.boundingBox();
          if (box) {
            positions.ol.push({
              selector,
              x: Math.round(box.x + box.width/2),
              y: Math.round(box.y + box.height/2),
              width: box.width,
              height: box.height
            });
            console.log(`  OL found: x=${Math.round(box.x + box.width/2)}, y=${Math.round(box.y + box.height/2)} (${selector})`);
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    console.log('\nAnalyzing Defensive Line positions...');
    for (const selector of dlSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const element of elements) {
          const box = await element.boundingBox();
          if (box) {
            positions.dl.push({
              selector,
              x: Math.round(box.x + box.width/2),
              y: Math.round(box.y + box.height/2),
              width: box.width,
              height: box.height
            });
            console.log(`  DL found: x=${Math.round(box.x + box.width/2)}, y=${Math.round(box.y + box.height/2)} (${selector})`);
          }
        }
      } catch (e) {
        // Continue
      }
    }
    
    console.log('\nAnalyzing Line of Scrimmage...');
    for (const selector of losSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const element of elements) {
          const box = await element.boundingBox();
          if (box) {
            positions.los.push({
              selector,
              x: Math.round(box.x + box.width/2),
              y: Math.round(box.y + box.height/2),
              width: box.width,
              height: box.height
            });
            console.log(`  LOS found: x=${Math.round(box.x + box.width/2)}, y=${Math.round(box.y + box.height/2)} (${selector})`);
          }
        }
      } catch (e) {
        // Continue
      }
    }

    console.log('\n=== POSITIONING ANALYSIS ===');
    
    if (positions.ol.length === 0) {
      console.log('❌ No Offensive Line players found');
    } else {
      console.log(`✓ Found ${positions.ol.length} Offensive Line players`);
    }
    
    if (positions.dl.length === 0) {
      console.log('❌ No Defensive Line players found');
    } else {
      console.log(`✓ Found ${positions.dl.length} Defensive Line players`);
    }
    
    if (positions.los.length === 0) {
      console.log('❌ No Line of Scrimmage found');
    } else {
      console.log(`✓ Found ${positions.los.length} Line of Scrimmage markers`);
    }

    // Analyze positioning relative to each other
    if (positions.ol.length > 0 && positions.dl.length > 0) {
      console.log('\n=== RELATIVE POSITIONING ===');
      const avgOLY = positions.ol.reduce((sum, pos) => sum + pos.y, 0) / positions.ol.length;
      const avgDLY = positions.dl.reduce((sum, pos) => sum + pos.y, 0) / positions.dl.length;
      
      console.log(`Average OL Y position: ${Math.round(avgOLY)}`);
      console.log(`Average DL Y position: ${Math.round(avgDLY)}`);
      
      if (avgOLY > avgDLY) {
        console.log('✓ CORRECT: Offensive Line is positioned behind (higher Y) Defensive Line');
      } else {
        console.log('❌ INCORRECT: Offensive Line should be behind Defensive Line');
      }
      
      const separation = Math.abs(avgOLY - avgDLY);
      console.log(`Separation between lines: ${Math.round(separation)} pixels`);
      
      if (separation > 10) {
        console.log('✓ Good separation between lines');
      } else {
        console.log('⚠️  Lines might be too close together');
      }
    }

    console.log('\n=== VERIFICATION COMPLETE ===');
    console.log('Screenshots saved:');
    console.log('- after-entering-football-app.png');
    console.log('- ol-dl-positioning-final.png');
    
    // Exit full screen before closing
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

  } catch (error) {
    console.error('Error during verification:', error);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

verifyOLDLPositioning();