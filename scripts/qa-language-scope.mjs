import assert from 'node:assert/strict'

function getScope(settings, cards) {
  const scopedNative = settings?.native_lang || cards[0]?.nativeLang || null
  const scopedTarget = settings?.target_lang || cards[0]?.targetLang || null

  if (scopedNative && scopedTarget) {
    return { native_lang: scopedNative, target_lang: scopedTarget }
  }

  return { native_lang: null, target_lang: null }
}

function rowMatchesScope(row, scope) {
  return row.native_lang === scope.native_lang && row.target_lang === scope.target_lang
}

function getIdsToDelete(existingRows, cards, scope) {
  const scopedRows = existingRows.filter((row) => rowMatchesScope(row, scope))
  const nextIds = new Set(cards.map((card) => card.id))
  return scopedRows.map((row) => row.id).filter((id) => !nextIds.has(id))
}

function testKeepsOtherLanguageWords() {
  const settings = { native_lang: 'Español', target_lang: 'Alemán' }
  const cards = [
    { id: 'de-1', nativeLang: 'Español', targetLang: 'Alemán' },
    { id: 'de-2', nativeLang: 'Español', targetLang: 'Alemán' },
  ]
  const existingRows = [
    { id: 'de-1', native_lang: 'Español', target_lang: 'Alemán' },
    { id: 'de-old', native_lang: 'Español', target_lang: 'Alemán' },
    { id: 'pl-1', native_lang: 'Español', target_lang: 'Polaco' },
    { id: 'pl-2', native_lang: 'Español', target_lang: 'Polaco' },
  ]

  const scope = getScope(settings, cards)
  const idsToDelete = getIdsToDelete(existingRows, cards, scope)

  assert.deepEqual(idsToDelete, ['de-old'])
}

function testDeletesOnlyCurrentScopeWhenEmpty() {
  const settings = { native_lang: 'Español', target_lang: 'Polaco' }
  const cards = []
  const existingRows = [
    { id: 'pl-1', native_lang: 'Español', target_lang: 'Polaco' },
    { id: 'pl-2', native_lang: 'Español', target_lang: 'Polaco' },
    { id: 'de-1', native_lang: 'Español', target_lang: 'Alemán' },
  ]

  const scope = getScope(settings, cards)
  const idsToDelete = getIdsToDelete(existingRows, cards, scope)

  assert.deepEqual(idsToDelete, ['pl-1', 'pl-2'])
}

function testLegacyNullScope() {
  const settings = null
  const cards = [{ id: 'legacy-keep', nativeLang: null, targetLang: null }]
  const existingRows = [
    { id: 'legacy-keep', native_lang: null, target_lang: null },
    { id: 'legacy-delete', native_lang: null, target_lang: null },
    { id: 'de-1', native_lang: 'Español', target_lang: 'Alemán' },
  ]

  const scope = getScope(settings, cards)
  const idsToDelete = getIdsToDelete(existingRows, cards, scope)

  assert.deepEqual(idsToDelete, ['legacy-delete'])
}

function run() {
  const tests = [
    ['keeps words from other language pairs', testKeepsOtherLanguageWords],
    ['deletes only current language scope when empty', testDeletesOnlyCurrentScopeWhenEmpty],
    ['supports legacy rows with null languages', testLegacyNullScope],
  ]

  for (const [name, testFn] of tests) {
    testFn()
    console.log(`✓ ${name}`)
  }

  console.log('\nQA language-scope checks passed.')
}

run()
