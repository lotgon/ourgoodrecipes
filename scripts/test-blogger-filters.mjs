import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual catalog loader and filtering with a minimal DOM.
class Element {
  constructor() { this.dataset = {}; this.style = {}; this.children = []; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  querySelector() { return null; }
  get innerText() { return this.textContent + this.children.map(child => child.innerText).join(' '); }
}
const list = new Element();
const count = new Element();
const empty = new Element();
const search = { value: '' };
const cards = list.children;
const manifest = JSON.parse(readFileSync(new URL('../recipes/blogger/_manifest.json', import.meta.url)));
const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const bootstrap = /getButtons\(\)\.forEach\(bindFilter\);\s*ensureFilterPanel\(\);\s*finalizeCatalog\(\);\s*searchInput\.addEventListener\('input', render\);\s*loadPotatoRecipe\(\);\s*loadTryRecipes\(\);\s*loadBloggerRecipes\(\);/;
assert(bootstrap.test(source));
const context = vm.createContext({ console, document: {
  getElementById: id => ({ recipeList: list, recipeCount: count, emptyState: empty, recipeSearch: search })[id],
  createElement: () => new Element(), querySelectorAll: () => cards
}, fetch: async () => ({ ok: true, json: async () => manifest }), localStorage: { getItem: () => '{}' } });
vm.runInContext(source.replace(bootstrap, ''), context);
vm.runInContext('finalizeCatalog = function () {};', context);
await vm.runInContext('loadBloggerRecipes()', context);
assert.equal(cards.length, manifest.recipes.length);
vm.runInContext("selectedIngredient = 'eggplant'; render();", context);
const eggplants = manifest.recipes.filter(entry => /баклажан/i.test(entry.title));
assert.equal(eggplants.length, 8);
for (const recipe of eggplants) assert.equal(cards.find(card => card.dataset.recipeId === recipe.id).hidden, false, recipe.title);
assert(cards.some(card => card.hidden), 'Unrelated recipes must be hidden');
assert.equal(cards.filter(card => !card.hidden).length, eggplants.length);
const tags = entry => Array.from(context.bloggerIngredientTags(entry));
assert.deepEqual(tags({ title: 'Тофу с баклажанами и рисом', labels: ['Брокколи', 'Авокадо'] }), ['broccoli', 'avocado', 'eggplant', 'tofu', 'rice']);
assert.deepEqual(tags({ title: 'Говядина с картошкой', labels: [] }), ['beef', 'potato']);
assert.deepEqual(tags({ title: 'Рисовая мука и ирис', labels: ['Вторые блюда'] }), []);
assert.deepEqual(tags({ title: 'Мясная лазанья', labels: [] }), []);
assert.deepEqual(tags({ title: 'Салат', labels: ['баклажаны'] }), ['eggplant']);
vm.runInContext("selectedIngredient = 'all'; render();", context);
assert(cards.every(card => !card.hidden));
console.log(`Blogger ingredient filters passed: ${cards.length} cards, all 8 eggplant recipes, mixed ingredients and false positives.`);
