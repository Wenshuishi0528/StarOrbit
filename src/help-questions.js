import questions from './help-content/questions.json' with { type: 'json' };

function folded(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[-’']/g, ' ').trim();
}

const entries = questions.map(({ id, section, ...translations }) => ({
  id,
  section,
  translations,
  aliases: Object.values(translations).flatMap(([question, , aliases]) =>
    [question, ...aliases.split('|')].map((pattern) => pattern.split('+').map(folded))
  ),
}));

export function findHelpAnswers(input, language = 'zh') {
  const query = folded(input);
  if (!query) return [];
  const latinWords = query.split(/[^a-z0-9]+/);
  const contains = (term) =>
    /^[a-z]{1,2}$/.test(term) ? latinWords.includes(term) : query.includes(term);
  return entries
    .map(({ id, section, translations, aliases }) => {
      let score = 0;
      for (const pattern of aliases) {
        if (pattern.every(contains))
          score = Math.max(score, pattern.join('').length + 3 * (pattern.length - 1));
      }
      const [question, answer] = translations[language] || translations.zh;
      return { id, section, question, answer, score };
    })
    .filter((item) => item.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function suggestedQuestions(language) {
  return ['depart', 'solar', 'coords'].map((id) => {
    const item = entries.find((entry) => entry.id === id);
    return (item.translations[language] || item.translations.zh)[0];
  });
}
