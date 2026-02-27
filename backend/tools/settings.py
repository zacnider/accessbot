"""Voice-controlled settings tools.

Allows the user to change AccessBot settings via voice commands.
Settings changes are sent to the Chrome extension which persists them.
"""


def change_speech_rate(rate: str) -> dict:
    """Change the speech rate of AccessBot.

    Args:
        rate: The desired speech rate. Can be:
              - "faster" or "hızlı" to increase by 0.25x
              - "slower" or "yavaş" to decrease by 0.25x
              - "normal" to reset to 1.0x
              - A number like "1.5" for a specific rate (0.5 to 3.0)

    Returns:
        dict with action to change speech rate
    """
    return {
        "action": "change_setting",
        "setting": "speechRate",
        "value": rate,
    }


def change_language(language: str) -> dict:
    """Change the preferred language for AccessBot responses.

    Args:
        language: The language to use. Supported values:
                  - "Turkish" / "Türkçe"
                  - "English" / "İngilizce"
                  - "German" / "Deutsch"
                  - "French" / "Français"
                  - "Spanish" / "Español"
                  - "Arabic" / "العربية"
                  - "Russian" / "Русский"
                  - "Chinese" / "中文"
                  - "Japanese" / "日本語"
                  - "Korean" / "한국어"
                  - "Portuguese" / "Português"
                  - "Italian" / "Italiano"
                  - "Dutch" / "Nederlands"
                  - "Hindi" / "हिन्दी"
                  - "auto" for automatic detection

    Returns:
        dict with action to change language
    """
    return {
        "action": "change_setting",
        "setting": "language",
        "value": language,
    }


def toggle_setting(setting_name: str, value: str) -> dict:
    """Toggle an AccessBot setting on or off.

    Args:
        setting_name: The setting to change. Available settings:
                      - "auto_describe" - Automatically describe pages when loaded
                      - "sound_effects" - Play sound effects for actions
                      - "verbosity" - Response detail level ("brief", "normal", "detailed")
        value: The value to set:
               - "on" or "off" for boolean settings
               - "brief", "normal", "detailed" for verbosity

    Returns:
        dict with action to toggle setting
    """
    return {
        "action": "change_setting",
        "setting": setting_name,
        "value": value,
    }
