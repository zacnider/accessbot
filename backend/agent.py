"""AccessBot ADK Agent definition.

Defines the main agent with bidi-streaming capabilities for real-time
voice + vision interaction with visually impaired users.
"""

from google.adk.agents import Agent

from config import AGENT_MODEL, AGENT_INSTRUCTION
from tools import (
    # Basic browser actions
    click_element,
    scroll_page,
    type_text,
    navigate_to,
    go_back,
    press_key,
    focus_element,
    select_option,
    read_page_text,
    tab_navigate,
    # Page analysis
    get_page_summary,
    list_interactive_elements,
    find_element,
    # Tab management
    list_all_tabs,
    switch_to_tab,
    close_tab,
    open_new_tab,
    zoom_page,
    # Advanced actions
    right_click,
    double_click,
    hover_element,
    clipboard_action,
    find_on_page,
    navigate_by_element_type,
    get_page_structure,
    read_selected_text,
    keyboard_shortcut,
    drag_and_drop,
    search_web,
    move_mouse,
    scroll_to_element,
    # Voice-controlled settings
    change_speech_rate,
    change_language,
    toggle_setting,
    # Smart page awareness
    detect_page_type,
    get_contextual_suggestions,
)

root_agent = Agent(
    name="accessbot",
    model=AGENT_MODEL,
    instruction=AGENT_INSTRUCTION,
    tools=[
        # Basic browser actions
        click_element,
        scroll_page,
        type_text,
        navigate_to,
        go_back,
        press_key,
        focus_element,
        select_option,
        read_page_text,
        tab_navigate,
        # Page analysis
        get_page_summary,
        list_interactive_elements,
        find_element,
        # Tab management
        list_all_tabs,
        switch_to_tab,
        close_tab,
        open_new_tab,
        zoom_page,
        # Advanced actions
        right_click,
        double_click,
        hover_element,
        clipboard_action,
        find_on_page,
        navigate_by_element_type,
        get_page_structure,
        read_selected_text,
        keyboard_shortcut,
        drag_and_drop,
        search_web,
        move_mouse,
        scroll_to_element,
        # Voice-controlled settings
        change_speech_rate,
        change_language,
        toggle_setting,
        # Smart page awareness
        detect_page_type,
        get_contextual_suggestions,
    ],
    description="An accessibility web navigator that helps visually impaired users browse the web using voice commands and screen analysis.",
)
