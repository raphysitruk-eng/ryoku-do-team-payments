/* Navigation only: account access and data actions remain in admin.js. */
(() => {
  'use strict';
  const tabs = Array.from(document.querySelectorAll('[data-admin-tab]'));
  const panels = Array.from(document.querySelectorAll('.admin-tab-panel'));
  const storageKey = 'ryokudo-admin-topic';
  const valid = key => tabs.some(tab => tab.dataset.adminTab === key);
  let active = 'overview';

  function selectTab(key, {focus = false, remember = true, updateUrl = true} = {}) {
    if (!valid(key)) return;
    active = key;
    tabs.forEach(tab => {
      const selected = tab.dataset.adminTab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) {
        tab.focus({preventScroll: true});
        tab.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'auto'});
      }
    });
    panels.forEach(panel => { panel.hidden = panel.id !== `panel-${key}`; });
    if (remember) {
      try { window.sessionStorage.setItem(storageKey, key); } catch {}
    }
    // Recovery tokens belong to the authentication flow; do not alter its URL.
    if (updateUrl && !/access_token=|refresh_token=|type=recovery/.test(window.location.hash)) {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', key);
      window.history.replaceState(window.history.state, '', url.href);
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.adminTab));
    tab.addEventListener('keydown', event => {
      let next;
      const rtl = document.documentElement.dir === 'rtl';
      if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
      else if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[(next + tabs.length) % tabs.length].dataset.adminTab, {focus: true});
    });
  });

  document.querySelectorAll('[data-open-tab]').forEach(button => {
    button.addEventListener('click', () => {
      selectTab(button.dataset.openTab, {focus: true});
    });
  });

  // Close a row's action disclosure after its action has run.
  document.addEventListener('click', event => {
    const menu = event.target.closest?.('.row-menu');
    if (menu && event.target.closest('button')) menu.open = false;
  });

  window.RyokuAdminUI = Object.freeze({
    open: selectTab,
    updateSummary() {
      const node = document.getElementById('overviewUpdated');
      if (node) node.textContent = 'עודכן בשעה ' + new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute: '2-digit'});
    },
    updateAttention({count = 0, needsReview = false}) {
      const node = document.getElementById('overviewAttention');
      if (!node) return;
      const review = count > 0 || needsReview;
      node.textContent = count > 0 ? `${count} פריטים דורשים טיפול` : review ? 'תקינות המערכת דורשת בדיקה' : 'אין כרגע פריטים פתוחים לטיפול';
      node.parentElement.classList.toggle('needs-attention', review);
    },
    get activeTab() { return active; }
  });

  let initial = new URL(window.location.href).searchParams.get('tab');
  if (!valid(initial)) {
    try { initial = window.sessionStorage.getItem(storageKey); } catch {}
  }
  selectTab(valid(initial) ? initial : 'overview', {remember: false, updateUrl: false});
})();
