const searchInput = document.getElementById('recipeSearch');
const count = document.getElementById('recipeCount');
const empty = document.getElementById('emptyState');
const recipeList = document.getElementById('recipeList');
const ingredientFilters = document.getElementById('ingredientFilters');
let selectedIngredient = 'all';
let selectedStatus = 'all';
let selectedRating = 'all';
const RATING_KEY = 'our-good-recipes-ratings-v1';

function getButtons() { return Array.from(document.querySelectorAll('.ingredient-chip')); }
function getCards() { return Array.from(document.querySelectorAll('.recipe-card, .recipe-card-static')); }
function getRatings() { try { return JSON.parse(localStorage.getItem(RATING_KEY) || '{}'); } catch (error) { return {}; } }
function saveRatings(ratings) { localStorage.setItem(RATING_KEY, JSON.stringify(ratings)); }

function slugifyRecipeId(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureRecipeIds(root) {
  root.querySelectorAll('.recipe-card, .recipe-card-static').forEach(function(card) {
    if (!card.dataset.recipeId) {
      const title = card.querySelector('h3');
      if (title) card.dataset.recipeId = slugifyRecipeId(title.textContent);
    }
    if (card.dataset.recipeId && !card.id) card.id = 'recipe-' + card.dataset.recipeId;
  });
}

function setRecipeUrl(recipeId, replace) {
  const url = new URL(window.location.href);
  if (recipeId) url.searchParams.set('recipe', recipeId);
  else url.searchParams.delete('recipe');
  if (url.toString() === window.location.href) return;
  if (replace) history.replaceState({ recipe: recipeId || null }, '', url);
  else history.pushState({ recipe: recipeId || null }, '', url);
}

function applyRecipeFromUrl(shouldScroll) {
  ensureRecipeIds(document);
  const recipeId = new URL(window.location.href).searchParams.get('recipe');
  if (!recipeId) return false;
  const card = document.querySelector('[data-recipe-id="' + CSS.escape(recipeId) + '"]');
  if (!card) return false;

  searchInput.value = '';
  selectedIngredient = 'all';
  selectedStatus = 'all';
  selectedRating = 'all';
  getButtons().forEach(function(button) { button.classList.toggle('active', button.dataset.filter === 'all'); });
  document.querySelectorAll('[data-status-filter]').forEach(function(button) { button.classList.toggle('active', button.dataset.statusFilter === 'all'); });
  document.querySelectorAll('[data-rating-filter]').forEach(function(button) { button.classList.toggle('active', button.dataset.ratingFilter === 'all'); });
  render();

  const details = card.querySelector('.recipe-details');
  if (details) details.open = true;
  if (shouldScroll) requestAnimationFrame(function() { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  return true;
}

function normalizeStatuses(root) {
  root.querySelectorAll('.recipe-card, .recipe-card-static').forEach(function(card) {
    const badges = Array.from(card.querySelectorAll('.recipe-badges span'));
    let approved = card.dataset.approved === 'true';
    let tryIt = card.dataset.try === 'true';
    badges.forEach(function(span) {
      const text = span.textContent.trim();
      if (text === 'Проверен' || text === 'Одобрен' || text === 'Одобрено') { approved = true; span.remove(); }
      if (text === 'Попробовать') tryIt = true;
    });
    card.dataset.approved = approved ? 'true' : 'false';
    card.dataset.try = tryIt ? 'true' : 'false';
    if (approved) {
      const visual = card.querySelector('.recipe-visual');
      if (visual && !visual.querySelector('.approved-ribbon')) {
        const ribbon = document.createElement('span');
        ribbon.className = 'approved-ribbon';
        ribbon.textContent = 'Одобрен';
        visual.appendChild(ribbon);
      }
    }
  });
}

function setupDetailsLabels(root) {
  ensureRecipeIds(root);
  root.querySelectorAll('.recipe-details').forEach(function(details) {
    const summary = details.querySelector('summary');
    if (!summary || summary.dataset.bound === 'true') return;
    summary.dataset.bound = 'true';
    summary.textContent = details.open ? 'Закрыть рецепт' : 'Открыть рецепт';
    details.addEventListener('toggle', function() {
      summary.textContent = details.open ? 'Закрыть рецепт' : 'Открыть рецепт';
      const card = details.closest('.recipe-card, .recipe-card-static');
      if (!card || !card.dataset.recipeId) return;
      const currentRecipeId = new URL(window.location.href).searchParams.get('recipe');
      if (details.open) {
        if (currentRecipeId !== card.dataset.recipeId) setRecipeUrl(card.dataset.recipeId, false);
      } else if (currentRecipeId === card.dataset.recipeId) {
        setRecipeUrl(null, false);
      }
    });
  });
}

function moveMetadataIntoDetails(root) {
  Array.from(root.querySelectorAll('.recipe-card, .recipe-card-static')).forEach(function(card) {
    const meta = card.querySelector('.recipe-content > .recipe-meta');
    const details = card.querySelector('.recipe-details');
    if (!meta || !details || details.querySelector('.recipe-meta-details')) return;
    const dateSpans = Array.from(meta.querySelectorAll('span')).filter(function(span) {
      const text = span.textContent.trim();
      return text.startsWith('Опубликован:') || text.startsWith('Обновлён:');
    });
    if (dateSpans.length) {
      const detailsMeta = document.createElement('div');
      detailsMeta.className = 'recipe-meta recipe-meta-details';
      dateSpans.forEach(function(span) { detailsMeta.appendChild(span); });
      details.appendChild(detailsMeta);
    }
    const summary = details.querySelector('summary');
    const detailsGrid = details.querySelector('.recipe-grid');
    const detailsMeta = details.querySelector('.recipe-meta-details');
    if (summary && detailsGrid) {
      details.appendChild(detailsGrid);
      details.appendChild(summary);
      if (detailsMeta) details.appendChild(detailsMeta);
    }
    if (meta.children.length === 0) meta.remove();
  });
}

function getPublishedDate(card) {
  const published = Array.from(card.querySelectorAll('.recipe-meta span')).find(function(span) { return span.textContent.trim().startsWith('Опубликован:'); });
  if (!published) return 0;
  const match = published.textContent.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime() : 0;
}
function sortNewestFirst() { getCards().sort(function(a, b) { return getPublishedDate(b) - getPublishedDate(a); }).forEach(function(card) { recipeList.appendChild(card); }); }

function ensureFilterPanel() {
  if (document.getElementById('recipeFilters')) return;
  const heading = document.querySelector('.recipes-section .recipes-heading');
  if (!heading) return;
  const panel = document.createElement('div');
  panel.id = 'recipeFilters';
  panel.className = 'recipe-filters';
  panel.innerHTML = '<div class="filter-group"><span class="filter-label">Статус</span><div class="filter-row"><button class="filter-chip active" type="button" data-status-filter="all">Все</button><button class="filter-chip" type="button" data-status-filter="approved">✓ Одобрено</button><button class="filter-chip" type="button" data-status-filter="try">🧑‍🍳 Попробовать</button></div></div><div class="filter-group"><span class="filter-label">Оценка</span><div class="filter-row"><button class="filter-chip active" type="button" data-rating-filter="all">Любая</button><button class="filter-chip" type="button" data-rating-filter="10">10/10</button><button class="filter-chip" type="button" data-rating-filter="9">9/10+</button><button class="filter-chip" type="button" data-rating-filter="8">8/10+</button><button class="filter-chip" type="button" data-rating-filter="7">7/10+</button><button class="filter-chip" type="button" data-rating-filter="6">6/10+</button><button class="filter-chip" type="button" data-rating-filter="5">5/10+</button><button class="filter-chip" type="button" data-rating-filter="none">Без оценки</button></div></div>';
  heading.insertAdjacentElement('afterend', panel);
  panel.querySelectorAll('[data-status-filter]').forEach(function(button) { button.addEventListener('click', function() { selectedStatus = button.dataset.statusFilter; panel.querySelectorAll('[data-status-filter]').forEach(function(item) { item.classList.toggle('active', item === button); }); render(); }); });
  panel.querySelectorAll('[data-rating-filter]').forEach(function(button) { button.addEventListener('click', function() { selectedRating = button.dataset.ratingFilter; panel.querySelectorAll('[data-rating-filter]').forEach(function(item) { item.classList.toggle('active', item === button); }); render(); }); });
}

function renderRating(card) {
  const id = card.dataset.recipeId || (card.querySelector('h3') && card.querySelector('h3').textContent.trim());
  if (!id || card.querySelector('.recipe-rating')) return;
  const current = Number(getRatings()[id] || 0);
  const wrapper = document.createElement('div');
  wrapper.className = 'recipe-rating';
  wrapper.setAttribute('aria-label', 'Оценка рецепта от 1 до 10');
  const title = document.createElement('span');
  title.className = 'rating-title';
  title.textContent = current ? 'Ваша оценка' : 'Оценить';
  const stars = document.createElement('div');
  stars.className = 'rating-stars';
  for (let value = 1; value <= 10; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rating-star' + (value <= current ? ' selected' : '');
    button.textContent = '★';
    button.title = value + '/10';
    button.setAttribute('aria-label', value + ' из 10');
    button.addEventListener('click', function() { const ratings = getRatings(); ratings[id] = value; saveRatings(ratings); refreshRatings(); render(); });
    stars.appendChild(button);
  }
  const valueLabel = document.createElement('strong');
  valueLabel.className = 'rating-value';
  valueLabel.textContent = current ? current + '/10' : '—/10';
  wrapper.appendChild(title); wrapper.appendChild(stars); wrapper.appendChild(valueLabel);
  const content = card.querySelector('.recipe-content');
  if (content) content.appendChild(wrapper);
}
function refreshRatings() { getCards().forEach(function(card) { const old = card.querySelector('.recipe-rating'); if (old) old.remove(); renderRating(card); }); }

function render() {
  const query = searchInput.value.toLowerCase().trim();
  const ratings = getRatings();
  let visible = 0;
  getCards().forEach(function(card) {
    const id = card.dataset.recipeId || (card.querySelector('h3') && card.querySelector('h3').textContent.trim());
    const rating = Number(ratings[id] || 0);
    const tags = (card.dataset.filterTags || '').split(/\s+/);
    const byIngredient = selectedIngredient === 'all' || card.dataset.main === selectedIngredient || tags.includes(selectedIngredient);
    const byText = query === '' || card.innerText.toLowerCase().includes(query);
    const byStatus = selectedStatus === 'all' || (selectedStatus === 'approved' && card.dataset.approved === 'true') || (selectedStatus === 'try' && card.dataset.try === 'true');
    const byRating = selectedRating === 'all' || (selectedRating === 'none' ? rating === 0 : rating >= Number(selectedRating));
    const show = byIngredient && byText && byStatus && byRating;
    card.hidden = !show;
    if (show) visible += 1;
  });
  count.textContent = visible === 1 ? '1 рецепт' : visible + ' рецептов';
  empty.hidden = visible > 0;
}

function bindFilter(button) {
  if (button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  button.addEventListener('click', function() { selectedIngredient = button.dataset.filter; getButtons().forEach(function(item) { item.classList.toggle('active', item === button); }); render(); });
}
function ensurePotatoFilter() {
  if (document.querySelector('[data-filter="potato"]')) return;
  const button = document.createElement('button');
  button.className = 'ingredient-chip'; button.type = 'button'; button.dataset.filter = 'potato';
  button.innerHTML = '<span class="ingredient-icon">🥔</span><span>Картофель</span>';
  ingredientFilters.appendChild(button); bindFilter(button);
}
function splitIngredient(value) { const parts = value.split(' — '); return { name: parts.shift() || value, amount: parts.join(' — ') }; }
function buildPotatoCard(recipe) {
  const article = document.createElement('article');
  article.className = 'recipe-card'; article.dataset.main = 'potato'; article.dataset.recipeId = 'crispy-roast-potatoes'; article.dataset.approved = 'true'; article.id = 'recipe-crispy-roast-potatoes';
  article.dataset.search = 'картофель картошка хрустящая духовка сода крахмал запеченная запечённая сушёный измельчённый лук';
  const ingredientItems = recipe.ingredients.map(function(value) { const item = splitIngredient(value); return '<li><span>' + item.name + '</span>' + (item.amount ? '<strong>' + item.amount + '</strong>' : '') + '</li>'; }).join('');
  const stepItems = recipe.steps.map(function(step) { return '<li><strong>' + step.title + '.</strong> ' + step.text + '</li>'; }).join('');
  article.innerHTML = '<div class="recipe-visual" aria-hidden="true">🥔<span class="approved-ribbon">Одобрен</span></div><div class="recipe-content"><div class="recipe-badges"><span>Картофель</span><span>Духовка</span></div><h3>' + recipe.title + '</h3><p>' + recipe.description + '</p><div class="recipe-meta"><span>⏱ 50–55 мин</span><span>Опубликован: 23.08.2026</span><span>Обновлён: 23.08.2026</span></div><details class="recipe-details"><summary>Открыть рецепт</summary><div class="recipe-grid"><section class="panel ingredients"><h4>Ингредиенты</h4><ul>' + ingredientItems + '</ul></section><section class="panel steps"><h4>Приготовление</h4><ol>' + stepItems + '</ol><p><strong>Главный секрет:</strong> ' + recipe.tip + '</p></section></div></details></div>';
  return article;
}
async function loadPotatoRecipe() {
  try {
    const response = await fetch('recipes/crispy-roast-potatoes.json', { cache: 'no-store' });
    if (!response.ok) return;
    const recipe = await response.json();
    if (!document.querySelector('[data-recipe-id="crispy-roast-potatoes"]')) recipeList.appendChild(buildPotatoCard(recipe));
    ensurePotatoFilter(); ensureRecipeIds(document); normalizeStatuses(document); moveMetadataIntoDetails(document); setupDetailsLabels(document); refreshRatings(); sortNewestFirst(); render(); applyRecipeFromUrl(true);
  } catch (error) { console.error('Не удалось загрузить рецепт картофеля:', error); }
}

function formatRecipeDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[3] + '.' + match[2] + '.' + match[1] : value;
}

function buildTryRecipeCard(recipe, fallbackId) {
  const id = recipe.id || fallbackId;
  const article = document.createElement('article');
  article.className = 'recipe-card';
  article.dataset.main = 'dessert';
  article.dataset.filterTags = 'dessert';
  article.dataset.recipeId = id;
  article.dataset.try = 'true';
  article.id = 'recipe-' + id;

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const ingredientItems = ingredients.map(function(value) {
    const item = splitIngredient(String(value));
    return '<li><span>' + item.name + '</span>' + (item.amount ? '<strong>' + item.amount + '</strong>' : '') + '</li>';
  }).join('');
  const stepItems = steps.map(function(step) {
    if (typeof step === 'string') return '<li>' + step + '</li>';
    const title = step && step.title ? '<strong>' + step.title + '.</strong> ' : '';
    return '<li>' + title + (step && step.text ? step.text : '') + '</li>';
  }).join('');
  const published = formatRecipeDate(recipe.publishedAt);
  const updated = formatRecipeDate(recipe.updatedAt);
  const meta = [published ? '<span>Опубликован: ' + published + '</span>' : '', updated ? '<span>Обновлён: ' + updated + '</span>' : ''].join('');
  const description = recipe.description || recipe.notes && recipe.notes[0] || 'Рецепт, который ещё предстоит попробовать.';

  article.innerHTML = '<div class="recipe-visual" aria-hidden="true">🍰</div><div class="recipe-content"><div class="recipe-badges"><span>Десерт</span><span>Попробовать</span></div><h3>' + recipe.title + '</h3><p>' + description + '</p>' + (meta ? '<div class="recipe-meta">' + meta + '</div>' : '') + '<details class="recipe-details"><summary>Открыть рецепт</summary><div class="recipe-grid"><section class="panel ingredients"><h4>Ингредиенты</h4><ul>' + ingredientItems + '</ul></section><section class="panel steps"><h4>Приготовление</h4><ol>' + stepItems + '</ol></section></div></details></div>';
  return article;
}

async function loadTryRecipes() {
  const files = [
    { path: 'recipes/oat-blueberry-tart.json', id: 'oat-blueberry-tart' },
    { path: 'recipes/oatmeal-cookies-gluten-free.json', id: 'oatmeal-cookies-gluten-free' }
  ];

  await Promise.all(files.map(async function(file) {
    try {
      const response = await fetch(file.path, { cache: 'no-store' });
      if (!response.ok) return;
      const recipe = await response.json();
      const isTry = recipe.status === 'to-try' || recipe.status === 'Попробовать';
      if (!isTry || document.querySelector('[data-recipe-id="' + file.id + '"]')) return;
      recipeList.appendChild(buildTryRecipeCard(recipe, file.id));
    } catch (error) {
      console.error('Не удалось загрузить рецепт «Попробовать»:', file.path, error);
    }
  }));

  ensureRecipeIds(document);
  normalizeStatuses(document);
  moveMetadataIntoDetails(document);
  setupDetailsLabels(document);
  addPublicationMetadata(document);
  refreshRatings();
  sortNewestFirst();
  render();
  applyRecipeFromUrl(true);
}

function addPublicationMetadata(root) {
  root.querySelectorAll('.recipe-card, .recipe-card-static').forEach(function(card) {
    const meta = card.querySelector('.recipe-content > .recipe-meta, .recipe-meta-details');
    if (!meta || meta.querySelector('.publication-author')) return;
    const published = Array.from(meta.querySelectorAll('span')).find(function(span) { return span.textContent.trim().startsWith('Опубликован:'); });
    if (!published) return;
    const author = card.dataset.publishedBy || card.dataset.author || 'Our Good Recipes';
    const authorSpan = document.createElement('span');
    authorSpan.className = 'publication-author';
    authorSpan.textContent = 'Выложил: ' + author;
    meta.appendChild(authorSpan);
  });
}

getButtons().forEach(bindFilter);
ensureRecipeIds(document); normalizeStatuses(document); ensureFilterPanel(); moveMetadataIntoDetails(document); setupDetailsLabels(document); refreshRatings(); sortNewestFirst(); addPublicationMetadata(document);
searchInput.addEventListener('input', render);
window.addEventListener('popstate', function() { applyRecipeFromUrl(true); });
render(); applyRecipeFromUrl(true); loadPotatoRecipe(); loadTryRecipes();