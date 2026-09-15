import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CHARACTER_NAME_STYLES } from '../../src/domain/generators/nameData';
import { formatGeneratedName, generateNames, nameCandidates, type CharacterNameStyle, type NameOptions } from '../../src/domain/generators/names';
import { composedNames } from '../../src/domain/generators/namePatterns';
import { NameGeneratorService } from '../../src/services/NameGeneratorService';

test('all name styles produce ten distinct, readable results and refresh without immediate repeats', () => {
  const options: NameOptions[] = [
    ...Object.keys(CHARACTER_NAME_STYLES).flatMap((style) => (['male', 'female', 'any'] as const).flatMap((gender) =>
      [false, true].map((withSurname): NameOptions => ({ kind: 'character', style: style as CharacterNameStyle, gender, withSurname })))),
    { kind: 'settlement', style: 'russian' }, { kind: 'settlement', style: 'english' }
  ];
  for (const option of options) {
    const results = generateNames(option, {}, () => 0);
    assert.equal(results.length, 10, JSON.stringify(option));
    assert.equal(new Set(results.map(formatGeneratedName)).size, 10);
    for (const value of results) {
      assert.match(formatGeneratedName(value), /^[А-ЯЁа-яё -]+$/u);
      if (option.kind === 'character') {
        assert.equal(Boolean(value.surname), option.withSurname);
        if (option.gender !== 'any') assert.ok([...CHARACTER_NAME_STYLES[option.style][option.gender], ...composedNames(option.style, option.gender)].includes(value.name));
      }
    }
    const fresh = generateNames(option, { previous: results }, () => 0);
    assert.equal(fresh.length, 10);
    assert.ok(fresh.every((value) => !results.some((old) => formatGeneratedName(old) === formatGeneratedName(value))));
    assert.deepEqual(generateNames(option, {}, () => 0), results);
  }
});

test('Scandinavian patronymics agree with the given-name form, including mixed batches', () => {
  for (const gender of ['male', 'female'] as const) {
    const values = nameCandidates({ kind: 'character', style: 'scandinavian', gender, withSurname: true });
    for (const value of values) assert.match(value.surname, gender === 'female' ? /доттир$/ : /сон$/);
  }
});

test('Russian settlement phrases agree in gender and both naming traditions retain distinct forms', () => {
  const russian = nameCandidates({ kind: 'settlement', style: 'russian' }).map(formatGeneratedName);
  assert.ok(russian.includes('Белояр'));
  assert.ok(russian.includes('Каменный Брод'));
  assert.ok(russian.includes('Тихая Гавань'));
  for (const name of russian.filter((name) => / (Гавань|Пристань|Слобода)$/.test(name))) assert.match(name, /[ая]я /);
  assert.ok(!russian.includes('Каменный Гавань'));
  const english = nameCandidates({ kind: 'settlement', style: 'english' }).map(formatGeneratedName);
  assert.ok(english.includes('Даллстоун'));
  assert.ok(english.includes('Ривермид'));
  assert.ok(!english.includes('Брукбрук'));
});

test('every English settlement carries a meaning while copying keeps only the name', () => {
  const options: NameOptions = { kind: 'settlement', style: 'english' };
  const candidates = nameCandidates(options);
  assert.ok(candidates.every((value) => value.meaning?.trim()));
  assert.equal(candidates.find((value) => value.name === 'Ривермид')?.meaning, 'река + луг');
  assert.equal(candidates.find((value) => value.name === 'Айронхолд')?.meaning, 'железо + твердыня');
  assert.equal(candidates.find((value) => value.name === 'Стронгхолд')?.meaning, 'твердыня');
  for (const value of generateNames(options)) {
    assert.ok(value.meaning);
    assert.equal(formatGeneratedName(value), value.name);
  }
  for (const option of [
    { kind: 'settlement', style: 'russian' },
    { kind: 'character', style: 'english', gender: 'any', withSurname: true }
  ] satisfies NameOptions[]) assert.ok(generateNames(option).every((value) => value.meaning === undefined));
});

test('exhausted history still yields ten distinct names', () => {
  const options: NameOptions = { kind: 'character', style: 'latin', gender: 'male', withSurname: false };
  const results = generateNames(options, { previous: nameCandidates(options) }, () => 0);
  assert.equal(results.length, 10);
  assert.equal(new Set(results.map(formatGeneratedName)).size, 10);
});

test('composed names include short fantasy variants and hundreds of alternatives per style', () => {
  const english = composedNames('english', 'male');
  for (const name of ['Брэм', 'Брэк', 'Брэд']) assert.ok(english.includes(name));
  for (const style of Object.keys(CHARACTER_NAME_STYLES) as CharacterNameStyle[]) {
    for (const gender of ['male', 'female'] as const) {
      assert.ok(new Set(composedNames(style, gender)).size > 300, style + gender);
    }
  }
});

test('twenty consecutive batches avoid repeating given names, even with different surnames', () => {
  const service = new NameGeneratorService(() => 0.37);
  service.configure({ kind: 'character', style: 'english', gender: 'male', withSurname: true });
  const seen = new Set<string>();
  for (let batch = 0; batch < 20; batch++) {
    for (const value of service.state$.get().results) {
      assert.ok(!seen.has(value.name), value.name);
      seen.add(value.name);
    }
    service.regenerate();
  }
  assert.equal(seen.size, 200);
});

test('surname toggles preserve the batch and patronymics without consuming randomness', () => {
  for (const gender of ['male', 'female', 'any'] as const) {
    let draws = 0;
    const service = new NameGeneratorService(() => { draws++; return 0.37; });
    const options = { kind: 'character', style: 'scandinavian', gender, withSurname: false } as const;
    service.configure(options);
    const plain = service.state$.get().results;
    const drawsBeforeToggle = draws;
    service.configure({ ...options, withSurname: true });
    const full = service.state$.get().results;
    assert.deepEqual(full.map((value) => value.name), plain.map((value) => value.name));
    assert.ok(full.every((value) => value.surname));
    if (gender !== 'any') {
      assert.ok(full.every((value) => value.surname.endsWith(gender === 'female' ? 'доттир' : 'сон')));
    }
    service.configure(options);
    assert.deepEqual(service.state$.get().results, plain);
    service.configure({ ...options, withSurname: true });
    assert.deepEqual(service.state$.get().results, full);
    assert.equal(draws, drawsBeforeToggle);
    service.regenerate();
    assert.ok(service.state$.get().results.every((value) => !plain.some((old) => old.name === value.name)));
  }
});
