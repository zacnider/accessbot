"""Page analysis tools for AccessBot.

These tools request information from the Chrome extension about the current page.
The extension's content script gathers the DOM data and returns it.
"""


def get_page_summary() -> dict:
    """Get a summary of the current web page.

    Use this when the user asks "what's on this page?" or when navigating to a new page.
    Returns the page title, URL, and a count of key elements.

    Returns:
        A dict with the action command to request page summary from the extension.
    """
    return {
        "action": "get_page_summary",
        "status": "dispatched",
    }


def list_interactive_elements() -> dict:
    """List all interactive elements on the current page.

    Use this when the user wants to know what they can click on, or when they need
    to find a specific button, link, or form field.

    Returns:
        A dict with the action command to request interactive elements from the extension.
    """
    return {
        "action": "list_interactive_elements",
        "status": "dispatched",
    }


def find_element(description: str) -> dict:
    """Find a specific element on the page by description.

    Use this when the user is looking for a specific element like "the login button"
    or "the price of the first product".

    Args:
        description: A natural language description of the element to find.

    Returns:
        A dict with the action command to request element search from the extension.
    """
    return {
        "action": "find_element",
        "description": description,
        "status": "dispatched",
    }
