#!/usr/bin/env python3
"""
Playwright Configuration for macOS Stability
Centralized browser launch configuration with optimal settings
"""

def get_browser_config():
    """
    Returns optimized browser configuration for macOS
    """
    return {
        'headless': False,
        'args': [
            # Memory and performance optimizations
            '--disable-dev-shm-usage',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            
            # Security and stability
            '--no-sandbox',
            '--disable-web-security',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            
            # Reduce resource usage
            '--disable-extensions',
            '--disable-plugins',
            '--disable-javascript-harmony-shipping',
            
            # macOS specific optimizations
            '--disable-background-mode',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-sync',
            
            # Window and display settings
            '--start-maximized',
            '--disable-infobars',
            '--no-first-run',
            
            # Debugging and logging
            '--enable-logging',
            '--log-level=0'
        ],
        'viewport': {
            'width': 1440,
            'height': 900
        },
        'ignore_https_errors': True,
        'timeout': 60000,  # 60 second timeout
    }

def get_page_config():
    """
    Returns optimized page configuration
    """
    return {
        'default_timeout': 30000,  # 30 second default timeout
        'navigation_timeout': 60000,  # 60 second navigation timeout
    }

def get_context_config():
    """
    Returns optimized browser context configuration
    """
    return {
        'viewport': {'width': 1440, 'height': 900},
        'ignore_https_errors': True,
        'permissions': ['notifications'],
        'user_agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }

# Example usage function
def create_stable_browser(playwright):
    """
    Creates a browser instance with stable configuration
    """
    config = get_browser_config()
    browser = playwright.chromium.launch(**config)
    
    context_config = get_context_config()
    context = browser.new_context(**context_config)
    
    page = context.new_page()
    page_config = get_page_config()
    
    page.set_default_timeout(page_config['default_timeout'])
    page.set_default_navigation_timeout(page_config['navigation_timeout'])
    
    return browser, context, page

if __name__ == "__main__":
    print("Playwright macOS Configuration")
    print("=" * 40)
    print("Browser config:", get_browser_config())
    print("Page config:", get_page_config())
    print("Context config:", get_context_config())