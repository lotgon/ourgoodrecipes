(async function () {
  const root = document.getElementById('recipePage');
  if (!root) return;

  const jsonFile = document.body.dataset.recipeJson;
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
    const status = recipe.status === 'to-try' || recipe.status === 'Попробовать' ? 'Попробовать' : (recipe.status || '');

    root.innerHTML =
      '<article class="standalone-recipe">' +
        '<div class="recipe-page-heading">' +
          (status ? '<span class="recipe-page-status">' + esc(status) + '</span>' : '') +
          '<h1>' + esc(title) + '</h1>' +
          (description ? '<p>' + esc(description) + '</p>' : '') +
        '</div>' +
        '<div class="recipe-grid">' +
          '<section class="panel ingredients"><h2>Ингредиенты</h2><ul>' + ingredients.map(formatIngredient).join('') + '</ul></section>' +
          '<section class="panel steps"><h2>Приготовление</h2><ol>' + steps.map(formatStep).join('') + '</ol>' +
            (notes.length ? '<div class="recipe-page-notes"><h3>Заметки</h3><ul>' + notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '') +
          '</section>' +
        '</div>' +
      '</article>';
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
