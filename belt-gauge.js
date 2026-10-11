(function (global) {
  'use strict';

  // The saved percentage is authoritative; this lookup chooses a color only.
  const colors = {
    white: ['white', 'לבן', 'לבנה'],
    yellow: ['yellow', 'צהוב', 'צהובה'],
    orange: ['orange', 'כתום', 'כתומה'],
    green: ['green', 'ירוק', 'ירוקה'],
    blue: ['blue', 'כחול', 'כחולה'],
    brown: ['brown', 'חום', 'חומה'],
    black: ['black', 'שחור', 'שחורה', 'shodan', 'nidan', 'sandan', 'yondan', 'godan', 'rokudan', 'nanadan', 'hachidan', 'kudan', 'judan']
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function beltColor(rank) {
    const key = String(rank ?? '').trim().toLowerCase().replace(/^(?:חגורה|belt)\s+/, '').replace(/\s+belt$/, '').trim();
    if (/^(?:dan|דאן|דן)\s*[1-9][0-9]*$/.test(key)) return 'black';
    return Object.keys(colors).find(color => colors[color].includes(key)) || 'neutral';
  }

  function percentage(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(Math.min(100, Math.max(0, number))) : null;
  }

  function point(radius, percent) {
    const angle = Math.PI * percent / 100;
    return [144 - radius * Math.cos(angle), 154 - radius * Math.sin(angle)].map(n => Number(n.toFixed(2)));
  }

  function markup({ percent, rank = '', compact = false, theme = 'light', language = 'he', state = '' } = {}) {
    const value = percentage(percent);
    const english = language === 'en';
    const label = english ? 'Progress from white to black belt' : 'התקדמות במסלול מלבנה לשחורה';
    const rankLabel = String(rank || '').trim() || (english ? 'Belt not set' : 'טרם הוגדרה חגורה');
    const unavailable = state === 'loading' ? (english ? 'Loading progress' : 'טוענים התקדמות') : (english ? 'Progress unavailable' : 'ההתקדמות אינה זמינה');
    const display = value === null ? (state === 'loading' ? '…' : '—') : value + '%';
    const accessible = label + ' · ' + rankLabel + ' · ' + (value === null ? unavailable : display);
    const ticks = Array.from({ length: 17 }, (_, i) => {
      const major = i % 4 === 0;
      const start = point(major ? 91 : 96, i * 100 / 16);
      const end = point(103, i * 100 / 16);
      return `<line class="belt-gauge__tick${major ? ' belt-gauge__tick--major' : ''}" x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}"/>`;
    }).join('');
    const needle = value === null ? '' : (() => {
      const end = point(78, value);
      return `<line class="belt-gauge__needle-outline" x1="144" y1="154" x2="${end[0]}" y2="${end[1]}"/><line class="belt-gauge__needle" x1="144" y1="154" x2="${end[0]}" y2="${end[1]}"/>`;
    })();
    const meter = value === null ? 'role="img"' : `role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-valuetext="${escape(display + ' · ' + rankLabel)}"`;
    return `<span class="belt-gauge${compact ? ' belt-gauge--compact' : ''}${theme === 'dark' ? ' belt-gauge--dark' : ''}${value === null ? ' belt-gauge--empty' : ''}" data-belt="${beltColor(rank)}" ${meter} aria-label="${escape(accessible)}">
      <svg class="belt-gauge__dial" viewBox="0 0 288 202" aria-hidden="true" focusable="false" direction="ltr">
        <path class="belt-gauge__rim" d="M32 154 A112 112 0 0 1 256 154"/>
        <path class="belt-gauge__arc" d="M32 154 A112 112 0 0 1 256 154"/>
        ${ticks}
        <g class="belt-gauge__scale"><text x="32" y="179">0</text><text x="144" y="23">50</text><text x="256" y="179">100</text></g>
        ${needle}<circle class="belt-gauge__hub" cx="144" cy="154" r="7"/>
        <text class="belt-gauge__value" x="144" y="193">${display}</text>
      </svg>
      <span class="belt-gauge__rank" dir="auto"><i class="belt-gauge__swatch" aria-hidden="true"></i><span>${escape(rankLabel)}</span></span>
    </span>`;
  }

  function render(element, options) {
    if (element) element.innerHTML = markup(options);
  }

  global.RyokuBeltGauge = Object.freeze({ markup, render, beltColor });
})(window);
