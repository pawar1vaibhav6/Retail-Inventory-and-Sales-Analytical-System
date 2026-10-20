import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ id = 'themeToggleBtn' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      id={id}
      className="theme-toggle-btn"
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`} />
    </button>
  );
}

