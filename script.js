const searchInput = document.getElementById('recipeSearch');
const count = document.getElementById('recipeCount');
const empty = document.getElementById('emptyState');
const recipeList = document.getElementById('recipeList');
const ingredientFilters = document.getElementById('ingredientFilters');
let selected = 'all';

function getButtons() { return Array.from(document.querySelectorAll('.ingredient-chip')); }
function getCards() { return Array.from(document.querySelectorAll('.recipe-card')); }

function normalizeStatuses(root) {
  root.querySelectorAll('.recipe-badges span').forEach(function(span) {
    if (span.textContent.trim() === 'Проверен') span.textContent = 'Одобрен';
  });
}

function setupDetailsLabels(root) {
  root.querySelectorAll('.recipe-details').forEach(function(details) {
    const summary = details.querySelector('summary');
    if (!summary || summary.dataset.bound === 'true') return;
    summary.dataset.bound = 'true';
    summary.textContent = details.open ? 'Закрыть рецепт' : 'Открыть рецепт';
    details.addEventListener('toggle', function() {
      summary.textContent = details.open ? 'Закрыть рецепт' : 'Открыть рецепт';
    });
  });
}

function moveMetadataIntoDetails(root) {
  const items = Array.from(root.querySelectorAll('.recipe-card, .recipe-card-static'));
  items.forEach(function(card) {
    const meta = card.querySelector('.recipe-content > .recipe-meta');
    const details = card.querySelector('.recipe-details');
    if (!meta || !details || details.querySelector('.recipe-meta-details')) return;
    const dateSpans = Array.from(meta.querySelectorAll('span')).filter(function(span) {
      const text = span.textContent.trim();
      return text.startsWith('Опубликован:') || text.startsWith('Обновлён:');
    });
    if (dateSpans.length > 0) {
      const detailsMeta = document.createElement('div');
      detailsMeta.className = 'recipe-meta recipe-meta-details';
      dateSpans.forEach(function(span) { detailsMeta.appendChild(span); });
      details.appendChild(detailsMeta);
    }
    if (meta.children.length === 0) meta.remove();
  });
}

function getPublishedDate(card) {
  const spans = Array.from(card.querySelectorAll('.recipe-meta span'));
  const published = spans.find(function(span) { return span.textContent.trim().startsWith('Опубликован:'); });
  if (!published) return 0;
  const match = published.textContent.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return 0;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
}

function sortNewestFirst() {
  getCards().sort(function(a, b) { return getPublishedDate(b) - getPublishedDate(a); })
    .forEach(function(card) { recipeList.appendChild(card); });
}

function render() {
  const query = searchInput.value.toLowerCase().trim();
  let visible = 0;
  getCards().forEach(function(card) {
    const byIngredient = selected === 'all' || card.dataset.main === selected;
    const byText = query === '' || card.innerText.toLowerCase().includes(query);
    const show = byIngredient && byText;
    card.hidden = !show;
    if (show) visible += 1;
  });
  count.textContent = visible === 1 ? '1 рецепт' : visible + ' рецептов';
  empty.hidden = visible > 0;
}

function bindFilter(button) {
  if (button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  button.addEventListener('click', function() {
    selected = button.dataset.filter;
    getButtons().forEach(function(item) { item.classList.toggle('active', item === button); });
    render();
  });
}

function ensurePotatoFilter() {
  if (document.querySelector('[data-filter="potato"]')) return;
  const button = document.createElement('button');
  button.className = 'ingredient-chip';
  button.type = 'button';
  button.dataset.filter = 'potato';
  button.innerHTML = '<span class="ingredient-icon">🥔</span><span>Картофель</span>';
  ingredientFilters.appendChild(button);
  bindFilter(button);
}

function splitIngredient(value) {
  const parts = value.split(' — ');
  return { name: parts.shift() || value, amount: parts.join(' — ') };
}

function buildPotatoCard(recipe) {
  const article = document.createElement('article');
  article.className = 'recipe-card';
  article.dataset.main = 'potato';
  article.dataset.recipeId = 'crispy-roast-potatoes';
  article.dataset.search = 'картофель картошка хрустящая духовка сода крахмал запеченная запечённая сушёный измельчённый лук';
  const ingredientItems = recipe.ingredients.map(function(value) {
    const item = splitIngredient(value);
    return '<li><span>' + item.name + '</span>' + (item.amount ? '<strong>' + item.amount + '</strong>' : '') + '</li>';
  }).join('');
  const stepItems = recipe.steps.map(function(step) { return '<li><strong>' + step.title + '.</strong> ' + step.text + '</li>'; }).join('');
  article.innerHTML = '<div class="recipe-visual" aria-hidden="true">🥔</div><div class="recipe-content"><div class="recipe-badges"><span>Картофель</span><span>Духовка</span><span>Одобрен</span></div><h3>' + recipe.title + '</h3><p>' + recipe.description + '</p><div class="recipe-meta"><span>⏱ 50–55 мин</span><span>Опубликован: 23.08.2026</span><span>Обновлён: 23.08.2026</span></div><details class="recipe-details"><summary>Открыть рецепт</summary><div class="recipe-grid"><section class="panel ingredients"><h4>Ингредиенты</h4><ul>' + ingredientItems + '</ul></section><section class="panel steps"><h4>Приготовление</h4><ol>' + stepItems + '</ol><p><strong>Главный секрет:</strong> ' + recipe.tip + '</p></section></div></details></div>';
  return article;
}

async function loadPotatoRecipe() {
  try {
    const response = await fetch('recipes/crispy-roast-potatoes.json', { cache: 'no-store' });
    if (!response.ok) return;
    const recipe = await response.json();
    if (!document.querySelector('[data-recipe-id="crispy-roast-potatoes"]')) recipeList.appendChild(buildPotatoCard(recipe));
    ensurePotatoFilter();
    normalizeStatuses(document);
    moveMetadataIntoDetails(document);
    setupDetailsLabels(document);
    sortNewestFirst();
    render();
  } catch (error) { console.error('Не удалось загрузить рецепт картофеля:', error); }
}

getButtons().forEach(bindFilter);
normalizeStatuses(document);
moveMetadataIntoDetails(document);
setupDetailsLabels(document);
sortNewestFirst();
searchInput.addEventListener('input', render);
render();
loadPotatoRecipe();
