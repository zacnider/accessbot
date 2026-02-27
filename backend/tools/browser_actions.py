"""Browser action tools that AccessBot can call via Gemini function calling.

These tools generate action commands that are sent to the Chrome extension
via WebSocket. The extension's content script executes the actual DOM actions.
"""


def click_element(element_description: str, x: int = 0, y: int = 0) -> dict:
    """Click on an element on the current web page.

    Use this when the user wants to click a button, link, or any interactive element.
    You can provide approximate x,y coordinates from the screenshot AND a description.

    Args:
        element_description: A description of the element to click (e.g. "the blue Submit button", "search icon")
        x: Approximate x coordinate of the element in the screenshot (0 if unknown)
        y: Approximate y coordinate of the element in the screenshot (0 if unknown)

    Returns:
        A dict with the action command to be sent to the extension.
    """
    return {
        "action": "click",
        "description": element_description,
        "x": x,
        "y": y,
        "status": "dispatched",
    }


def scroll_page(direction: str, amount: str = "medium") -> dict:
    """Scroll the current web page.

    Args:
        direction: The direction to scroll. One of: "up", "down", "left", "right"
        amount: How much to scroll. One of: "small" (100px), "medium" (300px), "large" (600px), "page" (full viewport)

    Returns:
        A dict with the action command.
    """
    pixels = {"small": 100, "medium": 300, "large": 600, "page": 900}
    px = pixels.get(amount, 300)

    delta_map = {
        "up": {"deltaX": 0, "deltaY": -px},
        "down": {"deltaX": 0, "deltaY": px},
        "left": {"deltaX": -px, "deltaY": 0},
        "right": {"deltaX": px, "deltaY": 0},
    }
    delta = delta_map.get(direction, {"deltaX": 0, "deltaY": px})

    return {
        "action": "scroll",
        "direction": direction,
        "amount": amount,
        **delta,
        "status": "dispatched",
    }


def type_text(text: str, field_description: str = "") -> dict:
    """Type text into an input field on the current web page.

    Args:
        text: The text to type into the field.
        field_description: A description of the input field (e.g. "the search box", "email field")

    Returns:
        A dict with the action command.
    """
    return {
        "action": "type",
        "text": text,
        "field_description": field_description,
        "status": "dispatched",
    }


def navigate_to(url: str) -> dict:
    """Navigate to a specific URL.

    Args:
        url: The full URL to navigate to (e.g. "https://www.google.com")

    Returns:
        A dict with the action command.
    """
    return {
        "action": "navigate",
        "url": url,
        "status": "dispatched",
    }


def go_back() -> dict:
    """Go back to the previous page in browser history.

    Returns:
        A dict with the action command.
    """
    return {
        "action": "go_back",
        "status": "dispatched",
    }


def press_key(key: str) -> dict:
    """Press a keyboard key or key combination.

    Use this for Enter, Tab, Escape, arrow keys, or shortcuts.

    Args:
        key: Key to press. Examples: "Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Backspace", "Space"

    Returns:
        A dict with the action command.
    """
    return {
        "action": "press_key",
        "key": key,
        "status": "dispatched",
    }


def focus_element(element_description: str, x: int = 0, y: int = 0) -> dict:
    """Focus on an element without clicking it. Useful for form fields.

    Args:
        element_description: Description of the element to focus
        x: Approximate x coordinate (0 if unknown)
        y: Approximate y coordinate (0 if unknown)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "focus",
        "description": element_description,
        "x": x,
        "y": y,
        "status": "dispatched",
    }


def select_option(option_text: str, field_description: str = "") -> dict:
    """Select an option from a dropdown/select menu.

    Args:
        option_text: The visible text of the option to select
        field_description: Description of the dropdown field

    Returns:
        A dict with the action command.
    """
    return {
        "action": "select_option",
        "option_text": option_text,
        "field_description": field_description,
        "status": "dispatched",
    }


def read_page_text() -> dict:
    """Read the main text content of the current page.

    Use when the user asks to read the page or wants to know the content.

    Returns:
        A dict with the action command.
    """
    return {
        "action": "read_page_text",
        "status": "dispatched",
    }


def tab_navigate(direction: str = "next") -> dict:
    """Navigate between interactive elements using Tab key.

    Args:
        direction: "next" for Tab (forward) or "previous" for Shift+Tab (backward)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "tab_navigate",
        "direction": direction,
        "status": "dispatched",
    }
