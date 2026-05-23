/**
 * Storage utilities for persisting user settings globally
 */

const SETTINGS_STORAGE_KEY = 'rsvp-global-settings';

/**
 * Save the user settings to localStorage
 * @param {Record<string, unknown>} settings - The settings to save
 * @returns {boolean} Whether the save was successful
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
}

/**
 * Load saved settings from localStorage
 * @returns {Object|null} The saved settings data or null if none exists
 */
export function loadSettings() {
  try {
    const data = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load settings:', error);
    return null;
  }
}
