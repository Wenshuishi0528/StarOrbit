import { t, getLanguage } from './i18n.js';
import { getXuntianTarget, searchXuntianTargets } from './xuntian-catalog.js';
import { searchSolarTargets } from './solar-targets.js';

const exampleGroups = [
  [
    'hip:91262',
    'hip:32349',
    'hip:27989',
    'hip:97649',
    'hip:11767',
    'hip:24436',
    'hip:24608',
    'hip:65474',
    'hip:80763',
  ],
  ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
  ['M31', 'M42', 'M45', 'M13', 'M57', 'M81', 'M27', 'M51', 'NGC7000', 'M8'],
];
// These are identifiers into the existing catalogues, never another set of
// names or coordinates. Refreshing examples does not select an aiming target.
export function createScopeExamples(random = Math.random) {
  let selected = [];
  const targets = (language) =>
    selected
      .map((id, i) =>
        i === 1
          ? searchSolarTargets(id, language).find((target) => target.body === id)
          : getXuntianTarget(id, language)
      )
      .filter(Boolean);
  return {
    targets,
    next(language) {
      selected = exampleGroups.map((group, i) => {
        const choices = group.filter((id) => id !== selected[i]);
        return choices[
          Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))
        ];
      });
      return targets(language);
    },
  };
}
export function mountScopeSearch(
  input,
  list,
  { choose, isBlocked, cityFinder, cityVisible, solarVisible, extraTargets = () => [] }
) {
  let results = [],
    index = 0;
  const examples = createScopeExamples();
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const placeholder = () => {
    const rows = examples.targets(getLanguage());
    if (rows.length)
      input.placeholder = rows
        .map((target) => target.name)
        .join(getLanguage() === 'zh' ? '、' : ', ');
  };
  function highlight() {
    Array.from(list.children).forEach((row, i) =>
      row.setAttribute('aria-selected', String(i === index))
    );
    if (results.length) input.setAttribute('aria-activedescendant', 'xt-result-' + index);
    else input.removeAttribute('aria-activedescendant');
  }
  function render() {
    const query = input.value.trim();
    list.replaceChildren();
    if (query) {
      const stars = searchXuntianTargets(query, getLanguage(), 7),
        cities = cityFinder.search(query, getLanguage());
      const bodies = searchSolarTargets(query, getLanguage());
      const exact = cities.filter((c) => c.score === 0),
        others = cities.filter((c) => c.score !== 0);
      // Exact city names come first. Preserve stellar results for HIP/name/IAU
      // searches, with space for city prefixes when both domains match.
      const cap = others.length ? 5 : 7;
      results = [
        ...extraTargets(query),
        ...bodies.filter((b) => b.exact),
        ...exact,
        ...bodies.filter((b) => !b.exact).slice(0, 3),
        ...stars.slice(0, cap),
        ...others,
        ...stars.slice(cap),
      ].slice(0, 7);
    } else {
      results = examples.targets(getLanguage());
      if (!results.length) {
        results = examples.next(getLanguage());
        placeholder();
      }
    }
    index = 0;
    if (!results.length) {
      const el = document.createElement('p');
      el.textContent = t('没有找到匹配的天体或城市。');
      list.append(el);
    }
    results.forEach((r, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.id = 'xt-result-' + i;
      row.setAttribute('role', 'option');
      row.tabIndex = -1;
      row.dataset.target = r.id;
      const name = document.createElement('b'),
        info = document.createElement('small');
      name.textContent = r.name;
      const city = r.type === 'city',
        hidden = city
          ? cityVisible(r) === false
          : r.type === 'solar'
            ? solarVisible(r.body) === false
            : isBlocked(r.direction);
      info.textContent = [
        t(city ? '城市' : r.category || (r.type === 'star' ? '恒星' : '星座')),
        r.identifier,
        hidden ? t(city ? '目标在地平线下' : '地球遮挡') : '',
      ]
        .filter(Boolean)
        .join(' · ');
      row.append(name, info);
      row.onpointerdown = (e) => e.preventDefault();
      row.onclick = () => select(i);
      list.append(row);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight();
  }
  function select(i) {
    if (!results[i]) return;
    const target = results[i];
    input.value = target.name;
    close();
    choose(target);
  }
  input.addEventListener('input', (e) => {
    if (!e.isComposing) render();
  });
  input.addEventListener('compositionend', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    if (list.hidden) render();
    if (!results.length || list.hidden) return;
    if (e.key === 'Enter') {
      select(index);
      return;
    }
    index = (index + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    highlight();
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  });
  return {
    close,
    refresh() {
      placeholder();
      if (!list.hidden) render();
    },
    refreshExamples() {
      examples.next(getLanguage());
      placeholder();
      if (!list.hidden) render();
    },
  };
}
