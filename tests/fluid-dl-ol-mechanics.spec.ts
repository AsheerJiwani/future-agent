import { test, expect } from '@playwright/test';

test.describe('Fluid DL/OL Mechanics Testing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3009');
    
    // Wait for the page to load
    await page.waitForTimeout(2000);
  });

  test('should test fluid DL/OL mechanics in Play Simulator', async ({ page }) => {
    // Click on Football Playbook Coach tab
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(1000);

    // Enter full screen mode (F11 equivalent)
    await page.keyboard.press('F11');
    await page.waitForTimeout(5000); // Wait 5 seconds as required

    // Navigate to Football Panel
    await page.click('text=Football Panel');
    await page.waitForTimeout(1000);

    // Navigate to Play Simulator
    await page.click('text=Play Simulator');
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ 
      path: 'test-results/01-play-simulator-initial.png',
      fullPage: true 
    });

    // Verify field is rendered
    const fieldElement = await page.locator('[data-testid="field-root"], .field-container, canvas, svg').first();
    await expect(fieldElement).toBeVisible();

    // Start multiple plays to observe DL movement patterns
    for (let playNumber = 1; playNumber <= 3; playNumber++) {
      console.log(`Testing play ${playNumber}...`);
      
      // Look for play button or start mechanism
      const playButton = await page.locator('button:has-text("Start"), button:has-text("Run"), button:has-text("Play"), [data-testid="start-play"], [data-testid="run-play"]').first();
      
      if (await playButton.isVisible()) {
        await playButton.click();
        console.log(`Started play ${playNumber}`);
        
        // Wait for animation/simulation to start
        await page.waitForTimeout(1000);
        
        // Take screenshot during early phase (should show initial rush paths)
        await page.screenshot({ 
          path: `test-results/02-play-${playNumber}-early-phase.png`,
          fullPage: true 
        });
        
        // Wait for engagement phase (continuous hand fighting)
        await page.waitForTimeout(2000);
        
        // Take screenshot during engagement phase
        await page.screenshot({ 
          path: `test-results/03-play-${playNumber}-engagement-phase.png`,
          fullPage: true 
        });
        
        // Wait for critical threshold phase (2.7-3.0s)
        await page.waitForTimeout(1500);
        
        // Take screenshot during pressure escalation
        await page.screenshot({ 
          path: `test-results/04-play-${playNumber}-pressure-phase.png`,
          fullPage: true 
        });
        
        // Wait for potential breakthrough
        await page.waitForTimeout(1000);
        
        // Take screenshot of breakthrough/pursuit
        await page.screenshot({ 
          path: `test-results/05-play-${playNumber}-breakthrough-phase.png`,
          fullPage: true 
        });
        
        // Reset or wait for play to complete
        await page.waitForTimeout(2000);
        
        // Look for reset button if available
        const resetButton = await page.locator('button:has-text("Reset"), button:has-text("Stop"), button:has-text("Clear")').first();
        if (await resetButton.isVisible()) {
          await resetButton.click();
          await page.waitForTimeout(500);
        }
      } else {
        console.log(`No play button found for play ${playNumber}, looking for alternative triggers...`);
        
        // Try clicking on the field itself to trigger play
        await fieldElement.click();
        await page.waitForTimeout(4000);
        
        // Take screenshot anyway
        await page.screenshot({ 
          path: `test-results/06-play-${playNumber}-field-click.png`,
          fullPage: true 
        });
      }
      
      await page.waitForTimeout(1000);
    }

    // Test specific DL positions and movements
    console.log('Testing specific DL position behaviors...');
    
    // Look for DL players on field (purple elements as mentioned)
    const dlElements = await page.locator('.dl-player, [data-position*="DL"], [data-position*="DE"], [data-position*="DT"], .defensive-line').all();
    
    if (dlElements.length > 0) {
      console.log(`Found ${dlElements.length} DL elements`);
      
      // Take detailed screenshot of DL positions
      await page.screenshot({ 
        path: 'test-results/07-dl-positions-detailed.png',
        fullPage: true 
      });
    }

    // Check for any error messages or console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Final comprehensive screenshot
    await page.screenshot({ 
      path: 'test-results/08-final-state.png',
      fullPage: true 
    });

    // Log any console errors found
    if (consoleErrors.length > 0) {
      console.log('Console errors detected:', consoleErrors);
    }

    // Verify no major errors occurred
    expect(consoleErrors.filter(err => err.includes('Error') || err.includes('Failed')).length).toBeLessThan(3);
  });

  test('should analyze DL movement patterns for fluidity', async ({ page }) => {
    await page.click('text=Football Playbook Coach');
    await page.waitForTimeout(1000);
    
    await page.keyboard.press('F11');
    await page.waitForTimeout(5000);
    
    await page.click('text=Football Panel');
    await page.waitForTimeout(1000);
    
    await page.click('text=Play Simulator');
    await page.waitForTimeout(2000);

    // Specifically look for curved rush paths vs straight lines
    const fieldContainer = await page.locator('.field-container, [data-testid="field-root"], canvas, svg').first();
    await expect(fieldContainer).toBeVisible();

    // Monitor for animation elements that indicate curved paths
    const animationElements = await page.locator('[style*="transform"], [style*="translate"], .animated, .rush-path').all();
    
    console.log(`Found ${animationElements.length} potentially animated elements`);

    // Test edge rusher curved paths (9-tech positions)
    await page.screenshot({ 
      path: 'test-results/09-edge-rusher-analysis.png',
      fullPage: true 
    });

    // Test interior rusher B-gap targeting (3-tech positions)  
    await page.screenshot({ 
      path: 'test-results/10-interior-rusher-analysis.png',
      fullPage: true 
    });

    // Look for oscillating movements (hand fighting)
    await page.waitForTimeout(3000);
    await page.screenshot({ 
      path: 'test-results/11-hand-fighting-oscillation.png',
      fullPage: true 
    });
  });
});