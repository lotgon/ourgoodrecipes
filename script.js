const searchInput = document.getElementById('recipeSearch');
const buttons = Array.from(document.querySelectorAll('.ingredient-chip'));
const cards = Array.from(document.querySelectorAll('.recipe-card'));
const count = document.getElementById('recipeCount');
const empty = document.getElementById('emptyState');
let selected = 'all';

function moveMetadataIntoDetails(root) {
  const items = Array.from(root.querySelectorAll('.recipe-card, .recipe-card-static'));
  items.forEach(function(card) {
    const meta = card.querySelector('.recipe-content > .recipe-meta');
    const details = card.querySelector('.recipe-details');
    if (!meta || !details) return;

    const dateSpans = Array.from(meta.querySelectorAll('span')).filter(function(span) {
      const text = span.textContent.trim();
      return text.startsWith('Опубликован:') || text.startsWith('Обновлён:');
    });

    if (dateSpans.length > 0) {
      const detailsMeta = document.createElement('div');
      detailsMeta.className = 'recipe-meta recipe-meta-details';
      dateSpans.forEach(function(span) {
        detailsMeta.appendChild(span);
      });
      details.insertBefore(detailsMeta, details.children[1] || null);
    }

    if (meta.children.length === 0) meta.remove();
  });
}

function render() {
  const query = searchInput.value.toLowerCase().trim();
  let visible = 0;

  cards.forEach(function(card) {
    const byIngredient = selected === 'all' || card.dataset.main === selected;
    const byText = query === '' || card.innerText.toLowerCase().includes(query);
    const show = byIngredient && byText;
    card.hidden = !show;
    if (show) visible += 1;
  });

  count.textContent = visible === 1 ? '1 рецепт' : visible + ' рецептов';
  empty.hidden = visible > 0;
}

buttons.forEach(function(button) {
  button.addEventListener('click', function() {
    selected = button.dataset.filter;
    buttons.forEach(function(item) {
      item.classList.toggle('active', item === button);
    });
    render();
  });
});

moveMetadataIntoDetails(document);
searchInput.addEventListener('input', render);
render();
