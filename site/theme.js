/* Shared preference is applied in the head, before either page is painted. */
(function () {
  'use strict';
  const key = 'scrollfly-theme';
  const root = document.documentElement;
  const normalize = value => value === 'light' ? 'light' : 'dark';
  function apply(value) {
    const theme = normalize(value);
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f5f8fa' : '#0a0d15';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const action = theme === 'light' ? 'Dark mode' : 'Light mode';
      button.querySelector('span').textContent = action;
      button.setAttribute('aria-label', 'Switch to ' + action.toLowerCase());
      button.title = 'Switch to ' + action.toLowerCase();
      button.hidden = false;
    });
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Still works without storage. */ }
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => apply(root.dataset.theme), { once: true });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    apply(theme);
    try { localStorage.setItem(key, theme); } catch { /* Keep this page's choice. */ }
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
