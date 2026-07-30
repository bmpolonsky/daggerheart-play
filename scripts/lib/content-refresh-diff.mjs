const FEATURE_GROUPS = new Set([
  'features',
  'foundation_features',
  'specialization_features',
  'mastery_features'
]);

export function compareContentPayloads(collectionKey, previousPayload, nextPayload) {
  const previousEntries = enumerateEntries(collectionKey, previousPayload);
  const nextEntries = enumerateEntries(collectionKey, nextPayload);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, entry] of nextEntries) {
    const previous = previousEntries.get(key);
    if (!previous) {
      added.push(entry);
      continue;
    }
    if (stableJson(previous.value) !== stableJson(entry.value)) {
      changed.push({
        key,
        label: entry.label,
        fields: changedFields(previous.value, entry.value)
      });
    }
  }
  for (const [key, entry] of previousEntries) {
    if (!nextEntries.has(key)) removed.push(entry);
  }

  return {
    collectionKey,
    previousGeneratedAt: generatedAt(previousPayload),
    nextGeneratedAt: generatedAt(nextPayload),
    previousItemCount: itemCount(previousPayload),
    nextItemCount: itemCount(nextPayload),
    previousEntryCount: previousEntries.size,
    nextEntryCount: nextEntries.size,
    added: added.sort(byKey),
    removed: removed.sort(byKey),
    changed: changed.sort(byKey),
    hasBaseline: isUsablePayload(previousPayload),
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0
  };
}

export function renderContentRefreshReport(comparisons, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const lines = [
    '# Daggerheart content refresh review',
    '',
    `Generated: ${generatedAt}`,
    ''
  ];
  const changedCollections = comparisons.filter((comparison) => comparison.hasChanges).length;
  const added = comparisons.reduce((total, comparison) => total + comparison.added.length, 0);
  const removed = comparisons.reduce((total, comparison) => total + comparison.removed.length, 0);
  const changed = comparisons.reduce((total, comparison) => total + comparison.changed.length, 0);
  lines.push(`Summary: ${changedCollections} collections changed; +${added} / -${removed} / ~${changed} entries.`);
  lines.push('');

  for (const comparison of comparisons) {
    lines.push(...renderCollection(comparison, generatedAt), '');
  }
  return `${lines.join('\n').trim()}\n`;
}

function renderCollection(comparison, reportGeneratedAt) {
  const lines = [
    `## ${comparison.collectionKey}`,
    '',
    `Baseline cache: ${formatTimestamp(comparison.previousGeneratedAt, reportGeneratedAt)}`,
    `Fetched cache: ${formatTimestamp(comparison.nextGeneratedAt, reportGeneratedAt)}`,
    `Items: ${comparison.previousItemCount} → ${comparison.nextItemCount}; review entries: ${comparison.previousEntryCount} → ${comparison.nextEntryCount}.`,
    ''
  ];
  if (!comparison.hasBaseline) {
    lines.push('No usable local baseline. The fetched payload cannot be reviewed as a diff yet.');
    return lines;
  }
  if (!comparison.hasChanges) {
    lines.push('No content changes.');
    return lines;
  }
  if (comparison.added.length > 0) {
    lines.push(`### Added (${comparison.added.length})`, '');
    for (const entry of comparison.added) lines.push(`- ${inlineCode(entry.key)}${labelSuffix(entry.label)}`);
    lines.push('');
  }
  if (comparison.removed.length > 0) {
    lines.push(`### Removed (${comparison.removed.length})`, '');
    for (const entry of comparison.removed) lines.push(`- ${inlineCode(entry.key)}${labelSuffix(entry.label)}`);
    lines.push('');
  }
  if (comparison.changed.length > 0) {
    lines.push(`### Changed (${comparison.changed.length})`, '');
    for (const entry of comparison.changed) {
      lines.push(`#### ${inlineCode(entry.key)}${labelSuffix(entry.label)}`, '');
      for (const field of entry.fields) {
        lines.push(`- ${inlineCode(field.path)}`);
        lines.push('  ```diff');
        lines.push(`  - ${printValue(field.before)}`);
        lines.push(`  + ${printValue(field.after)}`);
        lines.push('  ```');
      }
      lines.push('');
    }
  }
  return lines;
}

function enumerateEntries(collectionKey, payload) {
  const entries = new Map();
  const items = Array.isArray(payload?.data) ? payload.data : [];
  items.forEach((item, itemIndex) => {
    const itemIdentity = stableIdentity(item, itemIndex);
    const itemKey = `${collectionKey}/${itemIdentity}`;
    const itemValue = Object.fromEntries(
      Object.entries(item ?? {}).filter(([key]) => !FEATURE_GROUPS.has(key))
    );
    addEntry(entries, {
      key: itemKey,
      label: displayLabel(item),
      value: itemValue
    }, itemIndex);

    for (const group of FEATURE_GROUPS) {
      const features = Array.isArray(item?.[group]) ? item[group] : [];
      features.forEach((feature, featureIndex) => {
        addEntry(entries, {
          key: `${itemKey}/${group}/${stableIdentity(feature, featureIndex)}`,
          label: displayLabel(feature),
          value: feature
        }, featureIndex);
      });
    }
  });
  return entries;
}

function addEntry(entries, entry, fallbackIndex) {
  if (!entries.has(entry.key)) {
    entries.set(entry.key, entry);
    return;
  }
  const uniqueKey = `${entry.key}#${fallbackIndex}`;
  entries.set(uniqueKey, { ...entry, key: uniqueKey });
}

function stableIdentity(value, index) {
  const candidates = [value?.slug, value?.id, value?.key];
  const identity = candidates.find((candidate) => (
    typeof candidate === 'string' && candidate.trim()
    || typeof candidate === 'number' && Number.isFinite(candidate)
  ));
  return identity === undefined ? `index-${index}` : String(identity).trim();
}

function displayLabel(value) {
  const candidates = [value?.name, value?.title, value?.label];
  const label = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return label?.trim() ?? '';
}

function changedFields(before, after, path = '') {
  if (stableJson(before) === stableJson(after)) return [];
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => changedFields(
      before[key],
      after[key],
      path ? `${path}.${key}` : key
    ));
  }
  return [{
    path: path || 'value',
    before,
    after
  }];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJson(value[key])])
  );
}

function printValue(value) {
  if (value === undefined) return '<missing>';
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim() || '<empty>';
  return JSON.stringify(value);
}

function generatedAt(payload) {
  const value = payload?.meta?.generatedAt;
  return typeof value === 'string' ? value : null;
}

function itemCount(payload) {
  return Array.isArray(payload?.data) ? payload.data.length : 0;
}

function isUsablePayload(payload) {
  return payload?.result === 'ok' && Array.isArray(payload?.data) && payload.data.length > 0;
}

function formatTimestamp(value, reference) {
  if (!value) return 'unknown';
  const age = ageBetween(value, reference);
  return age ? `${value} (${age} old)` : value;
}

function ageBetween(value, reference) {
  const timestamp = Date.parse(value);
  const referenceTimestamp = Date.parse(reference);
  if (!Number.isFinite(timestamp) || !Number.isFinite(referenceTimestamp)) return '';
  const totalMinutes = Math.max(0, Math.floor((referenceTimestamp - timestamp) / 60_000));
  if (totalMinutes < 1) return 'less than a minute';
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return [
    days > 0 ? `${days}d` : '',
    hours > 0 ? `${hours}h` : '',
    minutes > 0 && days === 0 ? `${minutes}m` : ''
  ].filter(Boolean).join(' ');
}

function labelSuffix(label) {
  return label ? ` — ${escapeMarkdown(label)}` : '';
}

function inlineCode(value) {
  const text = String(value);
  const fence = text.includes('`') ? '``' : '`';
  return `${fence}${text}${fence}`;
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}[\]()#+.!|-])/g, '\\$1');
}

function byKey(left, right) {
  return left.key.localeCompare(right.key);
}
