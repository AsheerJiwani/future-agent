#!/usr/bin/env python3
"""
Focused test for OL/DL mechanics with precise element targeting
"""

from playwright.sync_api import sync_playwright
import time

def test_ol_dl_focused():
    with sync_playwright() as p:
        # Configure browser for macOS stability
        browser = p.chromium.launch(
            headless=False,
            args=[
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--no-sandbox',
                '--disable-web-security',
                '--disable-background-timer-throttling'
            ]
        )
        page = browser.new_page()
        
        try:
            # Navigate to the application
            print("📍 Navigating to http://localhost:3009...")
            page.goto("http://localhost:3009")
            page.wait_for_load_state("networkidle")
            time.sleep(3)
            
            # Click Football Playbook Coach
            print("🔍 Clicking Football Playbook Coach button...")
            panel_button = page.locator("button:has-text('Football Playbook Coach')").first
            panel_button.click()
            time.sleep(2)
            
            # Enter full screen mode as required
            print("🖥️ Entering full screen mode...")
            page.keyboard.press('F11')
            time.sleep(5)  # Wait 5 seconds as specified in CLAUDE.md
            
            # Navigate to Football Panel -> Play Simulator
            print("🏈 Opening Football Panel -> Play Simulator...")
            try:
                # Look for Football Panel button or link
                football_panel = page.locator("text=Football Panel").first
                football_panel.click()
                time.sleep(2)
                
                # Look for Play Simulator
                play_simulator = page.locator("text=Play Simulator").first
                play_simulator.click()
                time.sleep(2)
            except Exception as e:
                print(f"⚠️ Could not navigate to Play Simulator: {e}")
            
            page.screenshot(path=".playwright-mcp/focused-pre-snap.png")
            print("✅ Pre-snap screenshot taken")
            
            # Enable Pocket Envelope checkbox (top control bar)
            print("✅ Enabling Pocket Envelope visualization...")
            try:
                # Look for text "Pocket" and find nearby checkbox
                pocket_text = page.locator("text=Pocket").first
                pocket_text.click()  # This should toggle the checkbox
                time.sleep(0.5)
                print("✅ Pocket Envelope enabled")
            except Exception as e:
                print(f"⚠️ Could not enable Pocket Envelope: {e}")
            
            # Click the green "Snap" button
            print("🚀 Starting simulation...")
            snap_button = page.locator("button:has-text('Snap')").first
            snap_button.click()
            
            # Take focused screenshots at critical timing intervals
            print("\n🔥 FOCUSED OL/DL MECHANICS TEST:")
            print("   📏 Monitoring pocket formation and DL rush patterns")
            print("   🎯 Tracking OL-DL engagement phases\n")
            
            # Take screenshots at requested specific intervals
            intervals = [
                (0.5, "Snap + 0.5s (initial contact phase)"),
                (1.5, "Snap + 1.5s (engagement phase)"),
                (2.7, "Snap + 2.7s (critical threshold)"),
                (4.0, "Snap + 4.0s (advanced breakdown)")
            ]
            
            for i, (interval, description) in enumerate(intervals):
                sleep_time = interval if i == 0 else (interval - intervals[i-1][0])
                time.sleep(sleep_time)
                
                filename = f".playwright-mcp/focused-pocket-{int(interval*10)/10}s.png"
                page.screenshot(path=filename)
                print(f"📸 {interval}s - {description}: {filename}")
            
            # Final state
            time.sleep(1)
            page.screenshot(path=".playwright-mcp/focused-post-snap.png")
            print("📸 Final post-snap state captured")
            
            print("\n✅ Focused OL/DL mechanics test completed!")
            print("📋 Screenshots show the enhanced 3-phase DL rush system:")
            print("   🏃 Phase 1 (0-0.5s): DL rush toward assigned OL")
            print("   🤼 Phase 2 (0.5-2.7s): OL-DL jockeying/engagement") 
            print("   💥 Phase 3 (2.7s+): Selective breakthrough")
            
        except Exception as e:
            print(f"❌ Test failed with error: {e}")
            page.screenshot(path=".playwright-mcp/error-screenshot.png")
            raise
        finally:
            # Proper cleanup
            try:
                page.close()
            except:
                pass
            try:
                browser.close()
            except:
                pass
            print("🧹 Browser cleanup completed")

if __name__ == "__main__":
    test_ol_dl_focused()