const searchInput = document.getElementById('recipeSearch');
const buttons = Array.from(document.querySelectorAll('.ingredient-chip'));
const cards = Array.from(document.querySelectorAll('.recipe-card'));
const count = document.getElementById('recipeCount');
const empty = document.getElementById('emptyState');
const clear = document.getElementById('clearFilter');
let selected = 'all';

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

clear.addEventListener('click', function() {
  selected = 'all';
  searchInput.value = '';
  buttons.forEach(function(button) {
    button.classList.toggle('active', button.dataset.filter === 'all');
  });
  render();
});

searchInput.addEventListener('input', render);
render();
