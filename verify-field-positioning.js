const { chromium } = require('playwright');

async function verifyFieldPositioning() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to Football Playbook Coach...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Click on Football Playbook Coach card
    await page.locator('text="Football Playbook Coach"').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('2. Entering full screen and waiting for field to load...');
    await page.keyboard.press('F11');
    await page.waitForTimeout(5000);

    console.log('3. Taking screenshot of the field...');
    await page.screenshot({ 
      path: 'field-with-players.png', 
      fullPage: false  // Don't scroll, just capture viewport
    });

    console.log('4. Analyzing player positions on the field...');
    
    // Look for all circle elements (players) on the SVG field
    const players = await page.locator('svg circle').all();
    console.log(`Found ${players.length} player circles on the field`);
    
    const playerPositions = [];
    for (let i = 0; i < players.length; i++) {
      try {
        const player = players[i];
        const box = await player.boundingBox();
        if (box) {
          // Get player attributes to identify type
          const fill = await player.getAttribute('fill');
          const dataPosition = await player.getAttribute('data-position');
          const dataTestId = await player.getAttribute('data-testid');
          const className = await player.getAttribute('class');
          
          const position = {
            index: i,
            x: Math.round(box.x + box.width/2),
            y: Math.round(box.y + box.height/2),
            fill,
            dataPosition,
            dataTestId,
            className,
            width: box.width,
            height: box.height
          };
          
          playerPositions.push(position);
          
          console.log(`Player ${i + 1}: x=${position.x}, y=${position.y}, fill="${fill}", position="${dataPosition}", testId="${dataTestId}", class="${className}"`);
        }
      } catch (e) {
        console.log(`Could not get info for player ${i + 1}`);
      }
    }

    console.log('\n5. Looking for line of scrimmage markers...');
    
    // Look for line elements that might represent the line of scrimmage
    const lines = await page.locator('svg line').all();
    console.log(`Found ${lines.length} line elements`);
    
    const linePositions = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        const line = lines[i];
        const box = await line.boundingBox();
        if (box) {
          const stroke = await line.getAttribute('stroke');
          const strokeWidth = await line.getAttribute('stroke-width');
          const dataTestId = await line.getAttribute('data-testid');
          const className = await line.getAttribute('class');
          
          // Get line coordinates
          const x1 = await line.getAttribute('x1');
          const y1 = await line.getAttribute('y1');
          const x2 = await line.getAttribute('x2');
          const y2 = await line.getAttribute('y2');
          
          const lineInfo = {
            index: i,
            x1: parseFloat(x1) || 0,
            y1: parseFloat(y1) || 0,
            x2: parseFloat(x2) || 0,
            y2: parseFloat(y2) || 0,
            stroke,
            strokeWidth,
            dataTestId,
            className
          };
          
          linePositions.push(lineInfo);
          
          console.log(`Line ${i + 1}: (${lineInfo.x1},${lineInfo.y1}) to (${lineInfo.x2},${lineInfo.y2}), stroke="${stroke}", testId="${dataTestId}", class="${className}"`);
        }
      } catch (e) {
        console.log(`Could not get info for line ${i + 1}`);
      }
    }

    console.log('\n6. Analyzing offensive vs defensive positioning...');
    
    // Group players by color/type
    const offensivePlayers = playerPositions.filter(p => 
      p.fill === 'blue' || 
      p.fill === '#0000ff' || 
      p.fill === '#4169E1' ||
      (p.dataPosition && p.dataPosition.includes('ol')) ||
      (p.dataTestId && p.dataTestId.includes('offensive')) ||
      (p.className && p.className.includes('offensive'))
    );
    
    const defensivePlayers = playerPositions.filter(p => 
      p.fill === 'red' || 
      p.fill === '#ff0000' || 
      p.fill === '#DC143C' ||
      (p.dataPosition && p.dataPosition.includes('dl')) ||
      (p.dataTestId && p.dataTestId.includes('defensive')) ||
      (p.className && p.className.includes('defensive'))
    );

    console.log(`\nOffensive players (${offensivePlayers.length}):`);
    offensivePlayers.forEach(p => {
      console.log(`  Player at (${p.x}, ${p.y}) - fill: ${p.fill}, position: ${p.dataPosition}`);
    });

    console.log(`\nDefensive players (${defensivePlayers.length}):`);
    defensivePlayers.forEach(p => {
      console.log(`  Player at (${p.x}, ${p.y}) - fill: ${p.fill}, position: ${p.dataPosition}`);
    });

    // Find potential line of scrimmage
    const potentialLOS = linePositions.filter(l => 
      l.stroke === 'yellow' || 
      l.stroke === '#ffff00' ||
      l.stroke === 'white' ||
      l.stroke === '#ffffff' ||
      (l.dataTestId && l.dataTestId.includes('los')) ||
      (l.className && l.className.includes('scrimmage'))
    );

    console.log(`\nPotential Line of Scrimmage markers (${potentialLOS.length}):`);
    potentialLOS.forEach(l => {
      console.log(`  Line from (${l.x1}, ${l.y1}) to (${l.x2}, ${l.y2}) - stroke: ${l.stroke}`);
    });

    console.log('\n=== POSITIONING ANALYSIS ===');
    
    if (offensivePlayers.length > 0 && defensivePlayers.length > 0) {
      const avgOffensiveY = offensivePlayers.reduce((sum, p) => sum + p.y, 0) / offensivePlayers.length;
      const avgDefensiveY = defensivePlayers.reduce((sum, p) => sum + p.y, 0) / defensivePlayers.length;
      
      console.log(`Average Offensive Y position: ${Math.round(avgOffensiveY)}`);
      console.log(`Average Defensive Y position: ${Math.round(avgDefensiveY)}`);
      
      const separation = Math.abs(avgOffensiveY - avgDefensiveY);
      console.log(`Separation between lines: ${Math.round(separation)} pixels`);
      
      // In typical field view, higher Y values are typically "down field" 
      // Lower Y values are typically "up field" toward the end zone
      if (avgOffensiveY > avgDefensiveY) {
        console.log('✓ POSITIONING: Offensive line is positioned behind (higher Y) the defensive line');
        console.log('✓ This appears to be CORRECT positioning for offense vs defense');
      } else {
        console.log('❌ POSITIONING: Defensive line is positioned behind (higher Y) the offensive line');
        console.log('❌ This appears to be INCORRECT - offense should be behind their line of scrimmage');
      }
      
      if (separation > 10) {
        console.log('✓ Good separation between offensive and defensive lines');
      } else {
        console.log('⚠️  Lines are very close together (less than 10 pixels separation)');
      }
    } else {
      console.log('❌ Could not identify both offensive and defensive players clearly');
      console.log(`Found ${offensivePlayers.length} offensive players and ${defensivePlayers.length} defensive players`);
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Total players found: ${playerPositions.length}`);
    console.log(`Offensive players identified: ${offensivePlayers.length}`);
    console.log(`Defensive players identified: ${defensivePlayers.length}`);
    console.log(`Line markers found: ${linePositions.length}`);
    console.log(`Potential LOS markers: ${potentialLOS.length}`);
    
    console.log('\nScreenshot saved: field-with-players.png');
    
    // Exit full screen
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

  } catch (error) {
    console.error('Error during verification:', error);
    await page.screenshot({ path: 'error-field-analysis.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

verifyFieldPositioning();