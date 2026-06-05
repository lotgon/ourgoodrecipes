# Blogger — оформление рецептов

Скрипт `blogger_format.mjs` превращает посты блога
**ourgoodrecipes.blogspot.com** в красиво оформленные рецепты: карточка
ингредиентов и карточка шагов. Оригинальный текст сохраняется ниже под
пунктирной линией как черновик (для ручной проверки/удаления).

## Файлы

| Файл | Назначение |
|------|-----------|
| `blogger_format.mjs` | Основной скрипт-конвертер |
| `blogger_token.json` | OAuth-токены для Blogger API (**не коммитить**) |
| `posts_backup.json` | Бэкап оригиналов постов (до оформления) |
| `gsheets/token.json` | Отдельный токен для Google Sheets — **не трогать** |

## Использование

```bash
node blogger_format.mjs            # оформить только НОВЫЕ (ещё не оформленные) посты
node blogger_format.mjs --all      # переоформить все (оригинал берётся из черновика)
node blogger_format.mjs --id=ID    # один пост по id
node blogger_format.mjs --ids=A,B  # конкретные посты
node blogger_format.mjs --dry      # предпросмотр без записи
node blogger_format.mjs --dry --id=ID   # + сохранить preview_<id>.html
node blogger_format.mjs --backup   # брать посты из кэша, не из API
node blogger_format.mjs --help
```

**Типичный сценарий:** добавил новый рецепт в блог (хоть с телефона, как
угодно) → запустил `node blogger_format.mjs` → он находит неоформленный пост,
делает красиво, сохраняет. Уже оформленные не трогает.

## Что умеет парсер

- Структурированные посты (заголовки h2/h3): «Ингредиенты», «Приготовление»
- Под-рецепты в одном посте (напр. «Заварной крем» отдельно от основы)
- Под-группы ингредиентов («Для теста», «Для крема», «Для глазури»)
- Под-шаги (вложенные пункты: «15 мин при 200°C / 40 мин при 160°C»)
- Эмодзи-заголовки (`🥔 Ингредиенты`) и эмодзи-списки (`🥩…🌿…🧄…`)
- Блоки «Важно/Совет» → жёлтые подсказки ⚠️/💡
- Обычные посты без разметки (эвристика: количество = ингредиент,
  предложение = шаг, пустая строка = граница)
- Чистит мусор ` ```html ` и склейки слов на потерянных переносах

## API / токены

- Проект Google Cloud: **Lingua** (`lingua-490422`), Blogger API v3 включён
- OAuth client: «Desktop client 1 Claude» (тот же, что для Sheets)
- Scope: `https://www.googleapis.com/auth/blogger`
- Blog ID: `4333353184444059143`

⚠️ **OAuth consent в режиме Testing** → refresh-токен живёт ~7 дней.
Когда истечёт — повторить авторизацию (см. ниже) и обновить
`blogger_token.json`. Перевод в Production убрал бы ограничение, но требует
отдельного проекта.

### Обновить refresh-токен (раз в неделю при необходимости)

`CLIENT_ID` и `CLIENT_SECRET` взять из локального `blogger_token.json`
(в git их нет).

1. Открыть в браузере (под `andrei1pazniak@gmail.com`), подставив `CLIENT_ID`:
   ```
   https://accounts.google.com/o/oauth2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost&scope=https://www.googleapis.com/auth/blogger&response_type=code&access_type=offline&prompt=consent
   ```
2. Нажать «Разрешить» → скопировать `code=...` из адреса localhost
3. Обменять на токен:
   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d "code=ВСТАВИТЬ_CODE" \
     -d "client_id=CLIENT_ID" \
     -d "client_secret=CLIENT_SECRET" \
     -d "redirect_uri=http://localhost" \
     -d "grant_type=authorization_code"
   ```
4. Записать новый `refresh_token` в `blogger_token.json`
