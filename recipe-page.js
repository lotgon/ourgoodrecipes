(async function () {
  const root = document.getElementById('recipePage');
  if (!root) return;

  let jsonFile = document.body.dataset.recipeJson;
  const fallbackTitle = document.body.dataset.recipeTitle || 'Рецепт';
  const back = document.getElementById('backToCatalog');
  if (back) back.href = '../';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatIngredient(value) {
    if (typeof value === 'string') return '<li>' + esc(value) + '</li>';
    if (!value) return '';
    const name = value.name || value.ingredient || '';
    const amount = value.amount || value.quantity || '';
    return '<li><span>' + esc(name) + '</span>' + (amount ? '<strong>' + esc(amount) + '</strong>' : '') + '</li>';
  }

  function formatStep(step, index) {
    if (typeof step === 'string') return '<li>' + esc(step) + '</li>';
    if (!step) return '';
    const title = step.title ? '<strong>' + esc(step.title) + '.</strong> ' : '';
    return '<li>' + title + esc(step.text || step.description || ('Шаг ' + (index + 1))) + '</li>';
  }

  function formatNote(note) {
    if (typeof note === 'string') return '<li>' + esc(note) + '</li>';
    if (!note) return '';
    const heading = [note.label, note.text].filter(Boolean).join(': ');
    const items = Array.isArray(note.items) ? note.items : [];
    return '<li>' + esc(heading) + (items.length ? '<ul>' + items.map(formatNote).join('') + '</ul>' : '') + '</li>';
  }

  function render(recipe) {
    const title = recipe.title || fallbackTitle;
    document.title = title + ' — Our Good Recipes';
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    const notes = Array.isArray(recipe.notes) ? recipe.notes : [];
    const description = recipe.description || recipe.intro || '';
    let sourceText = typeof recipe.sourceText === 'string' ? recipe.sourceText.trim() : '';
    const sourceLines = sourceText.split(/\r?\n/);
    if (sourceLines[0].trim() === title.trim()) sourceText = sourceLines.slice(1).join('\n').trim();
    const useSourceText = !steps.length && !!sourceText;
    const status = recipe.status === 'to-try' || recipe.status === 'Попробовать' ? 'Попробовать' : (recipe.status === 'imported' ? 'Из старого блога' : (recipe.status || ''));
    const images = (recipe.images || []).filter(path => typeof path === 'string' && /^images\/blogger\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..'));

    root.innerHTML =
      '<article class="standalone-recipe">' +
        '<div class="recipe-page-heading">' +
          (status ? '<span class="recipe-page-status">' + esc(status) + '</span>' : '') +
          '<h1>' + esc(title) + '</h1>' +
          (recipe.verification?.status === 'needs-review' ? '<p>В исходной записи есть неоднозначности. Перед приготовлением проверьте оригинал и замечания ниже.</p>' : '') +
          (recipe.verification?.status === 'pending' ? '<p>Этот вариант ещё не сверен с оригиналом.</p>' : '') +
          (!useSourceText && description ? '<p>' + esc(description) + '</p>' : '') +
        '</div>' +
        images.map(path => '<img loading="lazy" style="max-width:100%;height:auto;border-radius:16px" src="../' + esc(path) + '" alt="' + esc(title) + '">').join('') +
        (recipe.originalText ? '<h2>Новая версия</h2>' : '') +
        '<div class="recipe-grid">' +
          (!useSourceText && ingredients.length ? '<section class="panel ingredients"><h2>Ингредиенты</h2><ul>' + ingredients.map(formatIngredient).join('') + '</ul></section>' : '') +
          '<section class="panel steps"' + (useSourceText || !ingredients.length ? ' style="grid-column:1 / -1"' : '') + '>' +
            (useSourceText ? '<h2>Исходный рецепт</h2><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(sourceText) + '</div>' : '<h2>Приготовление</h2>' + (steps.length ? '<ol>' + steps.map(formatStep).join('') + '</ol>' : '<p>Приготовление в исходной записи не указано.</p>')) +
            (!useSourceText && notes.length ? '<div class="recipe-page-notes"><h3>Заметки</h3><ul>' + notes.map(formatNote).join('') + '</ul></div>' : '') +
          '</section>' +
        '</div>' +
        (recipe.originalText ? '<details class="recipe-original" open style="margin-top:24px"><summary>Старая версия — оригинал</summary><p>Исходный текст сохранён для сравнения с новой версией.</p>' +
          (recipe.verification?.findings?.length ? '<ul>' + recipe.verification.findings.map(value => '<li>' + esc(value) + '</li>').join('') + '</ul>' : '') +
          '<div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(recipe.originalText) + '</div></details>' : '') +
      '</article>';
  }

  if (document.body.dataset.bloggerRecipe === 'true') {
    try {
      const id = new URLSearchParams(location.search).get('id');
      if (!/^blogger-\d+$/.test(id || '')) throw new Error('Invalid recipe ID');
      const response = await fetch('blogger/_manifest.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const manifest = await response.json();
      const entry = (manifest.recipes || []).find(item => item.id === id);
      if (!entry || !/^recipes\/blogger\/[a-zA-Z0-9_-]+\.json$/.test(entry.file)) throw new Error('Recipe not found');
      jsonFile = entry.file.slice('recipes/'.length);
    } catch (error) {
      root.textContent = 'Не удалось найти рецепт. Вернитесь в каталог и попробуйте снова.';
      return;
    }
  }

  if (!jsonFile) {
    root.innerHTML = '<p>Не указан файл рецепта.</p>';
    return;
  }

  try {
    const response = await fetch(jsonFile, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    render(await response.json());
  } catch (error) {
    console.error('Не удалось загрузить рецепт:', error);
    root.innerHTML = '<p>Не удалось загрузить рецепт.</p>';
  }
})();
