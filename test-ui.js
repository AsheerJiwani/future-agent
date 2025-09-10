// Simple UI Test Script for Football Simulator
// This script tests key accessibility features

const testUILayout = () => {
  console.log('🏈 Testing Football Simulator UI Layout...');
  
  // Test 1: Check if Football Playbook Coach tile exists
  const footballTile = document.querySelector('button[aria-controls="football-panel"]');
  console.log('✓ Football tile found:', !!footballTile);
  
  // Click to open football panel
  if (footballTile) {
    footballTile.click();
    
    // Wait for panel to load
    setTimeout(() => {
      // Test 2: Check if control panel exists
      const controlPanel = document.querySelector('[data-testid="game-controls"], .w-72');
      console.log('✓ Left control panel found:', !!controlPanel);
      
      // Test 3: Check if field container exists
      const fieldContainer = document.querySelector('[data-testid="field-container"]');
      console.log('✓ Field container found:', !!fieldContainer);
      
      // Test 4: Check if essential controls are accessible
      const snapButton = document.querySelector('button[class*="orange-600"]');
      const playSelect = document.querySelector('select[class*="emerald-500"]');
      const coverageSelect = document.querySelector('select[class*="cyan-500"]');
      
      console.log('✓ Snap button accessible:', !!snapButton);
      console.log('✓ Play selector accessible:', !!playSelect);
      console.log('✓ Coverage selector accessible:', !!coverageSelect);
      
      // Test 5: Check viewport dimensions and scroll requirements
      const body = document.body;
      const hasVerticalScroll = body.scrollHeight > window.innerHeight;
      const hasHorizontalScroll = body.scrollWidth > window.innerWidth;
      
      console.log('📱 Viewport height:', window.innerHeight);
      console.log('📱 Content height:', body.scrollHeight);
      console.log('❌ Requires vertical scroll:', hasVerticalScroll);
      console.log('❌ Requires horizontal scroll:', hasHorizontalScroll);
      
      // Test 6: Check if all controls are within viewport
      if (controlPanel) {
        const rect = controlPanel.getBoundingClientRect();
        const inViewport = rect.top >= 0 && rect.left >= 0 && 
                          rect.bottom <= window.innerHeight && 
                          rect.right <= window.innerWidth;
        console.log('✓ Control panel fully in viewport:', inViewport);
      }
      
      console.log('🎯 UI Layout Test Complete!');
      
    }, 2000);
  }
};

// Auto-run when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', testUILayout);
} else {
  testUILayout();
}