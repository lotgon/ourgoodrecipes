import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../recipe-page.js', import.meta.url), 'utf8');

async function render(recipe) {
  const root = { innerHTML: '' };
  const document = {
    body: { dataset: { recipeJson: 'test.json' } },
    getElementById: id => id === 'recipePage' ? root : null,
  };
  await vm.runInNewContext(code, {
    document,
    fetch: async () => ({ ok: true, json: async () => recipe }),
    console,
  });
  return root.innerHTML;
}

const fallback = await render({
  title: 'Блины',
  intro: 'Описание',
  ingredients: ['Картофель'],
  steps: [],
  notes: ['Совет'],
  sourceText: 'Блины\nОписание\nИнгредиенты\nКартофель\nСовет\n<script>alert(1)</script>',
});
for (const value of ['Блины', 'Описание', 'Картофель', 'Совет']) {
  assert.equal(fallback.split(value).length - 1, 1, `Fallback must show ${value} once`);
}
assert.ok(!fallback.includes('panel ingredients'));
assert.ok(!fallback.includes('recipe-page-notes'));
assert.ok(fallback.includes('&lt;script&gt;'));
assert.ok(!fallback.includes('<script>'));

const structured = await render({
  title: 'Слоёный салат',
  ingredients: ['Майонез', 'Майонез'],
  steps: ['Картофель.', 'Майонез.', 'Морковь.', 'Майонез.'],
  sourceText: 'Старый повторный текст',
  notes: [{ label: 'Совет', text: 'Текст', items: ['Первый совет', '<b>Второй совет</b>'] }],
});
assert.equal(structured.split('<li>Майонез</li>').length - 1, 2);
assert.equal(structured.split('<li>Майонез.</li>').length - 1, 2);
assert.ok(!structured.includes('Старый повторный текст'));
assert.ok(structured.includes('Совет: Текст'));
assert.ok(structured.includes('<li>Первый совет</li>'));
assert.ok(structured.includes('&lt;b&gt;Второй совет&lt;/b&gt;'));

const incomplete = await render({ title: 'Блины', ingredients: ['Сыр'], steps: [], sourceText: '  ' });
assert.ok(incomplete.includes('<li>Сыр</li>'));
assert.ok(incomplete.includes('Приготовление в исходной записи не указано.'));
assert.ok(!incomplete.includes('<ol></ol>'));

const differentTitle = await render({ title: 'Блины', sourceText: 'Блины с сыром\nРецепт' });
assert.ok(differentTitle.includes('Блины с сыром'));

const withOriginal = await render({title: 'Recipe', ingredients: ['New ingredient'], steps: ['New method'], originalText: 'Old quantity 200 g\n<script>not executable</script>'});
assert.ok(withOriginal.includes('<details class="recipe-original"'));
assert.ok(withOriginal.includes('<h2>Новая версия</h2>'));
assert.ok(withOriginal.includes('class="recipe-original" open'));
assert.ok(withOriginal.includes('Старая версия — оригинал'));
assert.ok(withOriginal.includes('Old quantity 200 g'));
assert.ok(withOriginal.includes('&lt;script&gt;not executable&lt;/script&gt;'));
assert.ok(!withOriginal.includes('<script>'));

const singleEdition = await render({title: 'Same', sourceText: 'Same\nUnique recipe body', originalText: 'Same\nUnique recipe body', steps: [], originalLinks: [{text: 'Source', url: 'https://example.org/?a=1&b=2'}, {text: 'Bad', url: 'javascript:alert(1)'}]});
assert.equal(singleEdition.split('Unique recipe body').length - 1, 1);
assert.ok(singleEdition.includes('Отдельной новой версии пока нет'));
assert.ok(!singleEdition.includes('Старая версия — оригинал'));
assert.ok(!singleEdition.includes('<h2>Новая версия</h2>'));
assert.ok(singleEdition.includes('href="https://example.org/?a=1&amp;b=2"'));
assert.ok(!singleEdition.includes('javascript:'));

const differentEditions = await render({title: 'Two editions', sourceText: 'New fallback', originalText: 'Old fallback', originalLinks: [{text: 'Old source', url: 'http://example.org/'}]});
assert.ok(differentEditions.includes('New fallback'));
assert.ok(differentEditions.includes('Old fallback'));
assert.ok(differentEditions.includes('<h2>Новая версия</h2>'));
assert.ok(differentEditions.includes('href="http://example.org/"'));

const manifest = JSON.parse(readFileSync(new URL('../recipes/blogger/_manifest.json', import.meta.url), 'utf8'));
for (const entry of manifest.recipes) {
  const recipe = JSON.parse(readFileSync(new URL('../' + entry.file, import.meta.url), 'utf8'));
  const output = await render(recipe);
  assert.ok(output.includes('<h1>'), `Missing recipe: ${entry.id}`);
  assert.ok(!output.includes('оригинальный текст (черновик)'), `Draft tail rendered: ${entry.id}`);
  assert.ok(!output.includes('см. оригинальный рецепт ниже'), `Broken fallback: ${entry.id}`);
  if (recipe.steps.length) assert.ok(!output.includes('<h2>Исходный рецепт</h2>'));
  else if (recipe.sourceText) assert.ok(!output.includes('panel ingredients'));
  else assert.ok(output.includes('Приготовление в исходной записи не указано.'));
}

console.log(`Recipe rendering regression checks passed, including ${manifest.recipes.length} catalog recipes.`);
