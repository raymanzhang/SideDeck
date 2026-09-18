// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only
setTimeout(async () => {
  const checks = {};
  const wait = () => new Promise(resolve => setTimeout(resolve, 100));
  const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  try {
    checks.layout = document.querySelectorAll('.panel-slot').length === 2 && document.body.scrollWidth <= innerWidth;
    const panel = document.querySelector('.panel-slot');
    checks.color = !!panel && getComputedStyle(document.querySelector('.settings-bar')).color !== 'rgba(0, 0, 0, 0)' && CSS.supports('color', 'color-mix(in oklab, red, blue)');
    checks.metrics = !!document.querySelector('.metric-cpu')?.textContent.match(/\d/) && !!document.querySelector('.metric-memory')?.textContent.match(/\d/);
    const settings = button('Settings'); settings.click(); await wait();
    checks.settings = !!document.querySelector('dialog[open]');
    const about = button('About SideDeck'); about.focus(); about.click(); await wait();
    checks.about = document.querySelectorAll('dialog[open]').length === 2 && /SideDeck \d+\.\d+\.\d+/.test(document.body.textContent);
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})); await wait();
    checks.focus = document.activeElement === about && document.querySelectorAll('dialog[open]').length === 1;
    button('Close').click(); await wait();
    checks.return = document.activeElement === settings;
    const state = await window.__TAURI_INTERNALS__.invoke('get_window_state');
    checks.nativeWindow = state.displays.length > 0 && state.actualDisplay !== null;
    checks.temperatureFallback = !!document.querySelector('.metric-temperature');
  } catch (error) { checks.error = String(error); }
  const report = { passed: Object.values(checks).every(value => value === true), checks, userAgent: navigator.userAgent };
  await window.__TAURI_INTERNALS__.invoke('smoke_report', { report });
}, 6000);
