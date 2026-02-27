"""Advanced interaction tools for AccessBot.

Provides right-click, double-click, hover, clipboard, page search,
screen-reader-style navigation, and accessibility features.
"""


def right_click(element_description: str, x: int = 0, y: int = 0) -> dict:
    """Right-click on an element to open context menu.

    Args:
        element_description: Description of the element to right-click
        x: Approximate x coordinate (0 if unknown)
        y: Approximate y coordinate (0 if unknown)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "right_click",
        "element_description": element_description,
        "x": x,
        "y": y,
        "status": "dispatched",
    }


def double_click(element_description: str, x: int = 0, y: int = 0) -> dict:
    """Double-click on an element. Useful for selecting text or opening items.

    Args:
        element_description: Description of the element to double-click
        x: Approximate x coordinate (0 if unknown)
        y: Approximate y coordinate (0 if unknown)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "double_click",
        "element_description": element_description,
        "x": x,
        "y": y,
        "status": "dispatched",
    }


def hover_element(element_description: str, x: int = 0, y: int = 0) -> dict:
    """Hover over an element. Useful to reveal tooltips, dropdowns, or submenus.

    Args:
        element_description: Description of the element to hover over
        x: Approximate x coordinate (0 if unknown)
        y: Approximate y coordinate (0 if unknown)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "hover",
        "element_description": element_description,
        "x": x,
        "y": y,
        "status": "dispatched",
    }


def clipboard_action(action: str, text: str = "") -> dict:
    """Perform clipboard operations: select all, copy, cut, or paste.

    Args:
        action: One of "select_all", "copy", "cut", "paste"
        text: Text to paste (only used with "paste" action)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "clipboard",
        "clipboard_action": action,
        "text": text,
        "status": "dispatched",
    }


def find_on_page(search_text: str) -> dict:
    """Search for text on the current page (like Ctrl+F).

    Finds and highlights the next occurrence of the text.

    Args:
        search_text: The text to search for on the page

    Returns:
        A dict with the action command.
    """
    return {
        "action": "find_on_page",
        "search_text": search_text,
        "status": "dispatched",
    }


def navigate_by_element_type(element_type: str, direction: str = "next") -> dict:
    """Navigate between elements of a specific type, like a screen reader.

    Jump to the next or previous heading, link, form field, landmark, image, or table.
    This is the primary way visually impaired users scan pages.

    Args:
        element_type: Type of element to jump to. One of:
            "heading" (h1-h6), "link" (a[href]),
            "form" (inputs, textareas, selects, buttons),
            "landmark" (nav, main, aside, header, footer),
            "image" (img with alt text),
            "table" (data tables),
            "button" (buttons and button-like elements),
            "list" (ul, ol)
        direction: "next" to go forward or "previous" to go backward

    Returns:
        A dict with the action command.
    """
    return {
        "action": "navigate_by_type",
        "element_type": element_type,
        "direction": direction,
        "status": "dispatched",
    }


def get_page_structure() -> dict:
    """Get the accessibility structure of the current page.

    Returns a structured overview: headings hierarchy, landmarks,
    forms, and main content areas. Like a screen reader's elements list.
    Use this to help the user understand the page layout.

    Returns:
        A dict with the action command.
    """
    return {
        "action": "get_page_structure",
        "status": "dispatched",
    }


def read_selected_text() -> dict:
    """Read the currently selected text on the page.

    Use when the user has selected text and wants to hear it.

    Returns:
        A dict with the action command.
    """
    return {
        "action": "read_selected_text",
        "status": "dispatched",
    }


def keyboard_shortcut(shortcut: str) -> dict:
    """Execute a keyboard shortcut (modifier + key combination).

    Use this for browser-level keyboard shortcuts. The shortcut is executed
    using the proper modifier keys for the user's OS.

    Args:
        shortcut: The shortcut to execute. Examples:
            - "Ctrl+C" (copy), "Ctrl+V" (paste), "Ctrl+X" (cut)
            - "Ctrl+A" (select all), "Ctrl+Z" (undo), "Ctrl+Y" (redo)
            - "Ctrl+T" (new tab), "Ctrl+W" (close tab), "Ctrl+Tab" (next tab)
            - "Ctrl+L" (focus address bar), "Ctrl+F" (find on page)
            - "Ctrl+Shift+T" (reopen closed tab)
            - "Alt+Left" (back), "Alt+Right" (forward)
            - "Ctrl+Plus" (zoom in), "Ctrl+Minus" (zoom out)
            - "F5" (refresh), "F11" (fullscreen)
            - "Ctrl+S" (save), "Ctrl+P" (print)
            - "Ctrl+Shift+Delete" (clear browsing data)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "keyboard_shortcut",
        "shortcut": shortcut,
        "status": "dispatched",
    }


def drag_and_drop(
    from_description: str,
    to_description: str,
    from_x: int = 0,
    from_y: int = 0,
    to_x: int = 0,
    to_y: int = 0,
) -> dict:
    """Drag an element and drop it on another element or location.

    Use for reordering items, moving files, slider controls, or any
    drag-and-drop interaction.

    Args:
        from_description: Description of the element to drag
        to_description: Description of the drop target
        from_x: Approximate x coordinate of the drag source (0 if unknown)
        from_y: Approximate y coordinate of the drag source (0 if unknown)
        to_x: Approximate x coordinate of the drop target (0 if unknown)
        to_y: Approximate y coordinate of the drop target (0 if unknown)

    Returns:
        A dict with the action command.
    """
    return {
        "action": "drag_and_drop",
        "from_description": from_description,
        "to_description": to_description,
        "from_x": from_x,
        "from_y": from_y,
        "to_x": to_x,
        "to_y": to_y,
        "status": "dispatched",
    }


def search_web(query: str, engine: str = "google") -> dict:
    """Search the web using a search engine.

    Opens a new search in the current tab. Use this when the user asks
    to search for something on the internet.

    Args:
        query: The search query text
        engine: Search engine to use. One of: "google", "bing", "duckduckgo", "youtube"

    Returns:
        A dict with the action command.
    """
    engine_urls = {
        "google": f"https://www.google.com/search?q={query}",
        "bing": f"https://www.bing.com/search?q={query}",
        "duckduckgo": f"https://duckduckgo.com/?q={query}",
        "youtube": f"https://www.youtube.com/results?search_query={query}",
    }
    url = engine_urls.get(engine, engine_urls["google"])

    return {
        "action": "navigate",
        "url": url,
        "status": "dispatched",
    }


def move_mouse(x: int, y: int) -> dict:
    """Move the mouse cursor to a specific position on the screen.

    Use for precise positioning, triggering hover effects, or
    preparing for other mouse actions.

    Args:
        x: The x coordinate on the screenshot to move to
        y: The y coordinate on the screenshot to move to

    Returns:
        A dict with the action command.
    """
    return {
        "action": "move_mouse",
        "x": x,
        "y": y,
        "status": "dispatched",
    }


def scroll_to_element(element_description: str) -> dict:
    """Scroll the page to make a specific element visible.

    Use when the user wants to go to a specific section or element
    that may be off-screen.

    Args:
        element_description: Description of the element to scroll to

    Returns:
        A dict with the action command.
    """
    return {
        "action": "scroll_to_element",
        "description": element_description,
        "status": "dispatched",
    }
