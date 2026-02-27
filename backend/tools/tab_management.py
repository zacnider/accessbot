"""Tab and browser management tools for AccessBot.

These tools handle tab switching, creation, closing, and browser-level
controls like zoom and bookmarks. They are executed directly by the
service worker (not the content script).
"""


def list_all_tabs() -> dict:
    """List all open browser tabs with their titles and URLs.

    Use this when the user asks "what tabs are open?" or "show my tabs".
    Returns info about all tabs so you can describe them to the user.

    Returns:
        A dict with the action command.
    """
    return {
        "action": "list_tabs",
        "status": "dispatched",
    }


def switch_to_tab(tab_index: int) -> dict:
    """Switch to a different browser tab by its index number.

    Use this when the user says "go to tab 2" or "switch to the Google tab".
    Tab indices start from 1 (leftmost tab).

    Args:
        tab_index: The 1-based index of the tab to switch to (1 = first/leftmost tab).

    Returns:
        A dict with the action command.
    """
    return {
        "action": "switch_tab",
        "tab_index": tab_index,
        "status": "dispatched",
    }


def close_tab(tab_index: int = 0) -> dict:
    """Close a browser tab. Closes current tab if no index given.

    Args:
        tab_index: The 1-based index of the tab to close (0 = current tab).

    Returns:
        A dict with the action command.
    """
    return {
        "action": "close_tab",
        "tab_index": tab_index,
        "status": "dispatched",
    }


def open_new_tab(url: str = "") -> dict:
    """Open a new browser tab, optionally navigating to a URL.

    Args:
        url: URL to open in the new tab. Empty string opens a blank new tab.

    Returns:
        A dict with the action command.
    """
    return {
        "action": "new_tab",
        "url": url,
        "status": "dispatched",
    }


def zoom_page(direction: str) -> dict:
    """Zoom the current page in, out, or reset to default.

    Args:
        direction: One of "in", "out", or "reset"

    Returns:
        A dict with the action command.
    """
    return {
        "action": "zoom",
        "direction": direction,
        "status": "dispatched",
    }
