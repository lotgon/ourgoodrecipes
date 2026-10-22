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

  function render(recipe) {
    const title = recipe.title || fallbackTitle;
    document.title = title + ' — Our Good Recipes';
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    const notes = Array.isArray(recipe.notes) ? recipe.notes : [];
    const description = recipe.description || recipe.intro || '';
    const status = recipe.status === 'to-try' || recipe.status === 'Попробовать' ? 'Попробовать' : (recipe.status === 'imported' ? 'Из старого блога' : (recipe.status || ''));
    const images = (recipe.images || []).filter(path => typeof path === 'string' && /^images\/blogger\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..'));

    root.innerHTML =
      '<article class="standalone-recipe">' +
        '<div class="recipe-page-heading">' +
          (status ? '<span class="recipe-page-status">' + esc(status) + '</span>' : '') +
          '<h1>' + esc(title) + '</h1>' +
          (description ? '<p>' + esc(description) + '</p>' : '') +
        '</div>' +
        images.map(path => '<img loading="lazy" style="max-width:100%;height:auto;border-radius:16px" src="../' + esc(path) + '" alt="' + esc(title) + '">').join('') +
        '<div class="recipe-grid">' +
          (ingredients.length ? '<section class="panel ingredients"><h2>Ингредиенты</h2><ul>' + ingredients.map(formatIngredient).join('') + '</ul></section>' : '') +
          '<section class="panel steps"' + (!ingredients.length ? ' style="grid-column:1 / -1"' : '') + '>' +
            (!steps.length && recipe.sourceText ? '<h2>Исходный рецепт</h2><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(recipe.sourceText) + '</div>' : '<h2>Приготовление</h2><ol>' + steps.map(formatStep).join('') + '</ol>') +
            (notes.length ? '<div class="recipe-page-notes"><h3>Заметки</h3><ul>' + notes.map(function(n){ return '<li>' + esc(typeof n === 'string' ? n : [n.label, n.text].filter(Boolean).join(': ')) + '</li>'; }).join('') + '</ul></div>' : '') +
          '</section>' +
        '</div>' +
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
