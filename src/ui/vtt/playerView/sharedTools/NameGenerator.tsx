/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { Copy, Dices } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import { CHARACTER_NAME_STYLES, SETTLEMENT_NAME_STYLES } from '../../../../domain/generators/nameData';
import { formatGeneratedName, type CharacterNameStyle, type NameGender, type NameOptions } from '../../../../domain/generators/names';
import { nameGeneratorService } from '../../../../services/serviceRegistry';
import { Button, Checkbox, IconButton, ListItem, Notice, SelectField, Toolbar } from '../../../components/common';
import styles from './NameGenerator.module.css';

export function NameGenerator() {
  const { options, results } = useStream(nameGeneratorService.state$);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const nameStyles = options.kind === 'character' ? CHARACTER_NAME_STYLES : SETTLEMENT_NAME_STYLES;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ text: `Скопировано: ${text}` });
    } catch {
      setFeedback({ text: 'Не удалось скопировать. Выделите нужный текст и скопируйте вручную.', error: true });
    }
  };

  return (
    <section className={styles.root} aria-label="Генератор имён и названий">
      <SelectField label="Тип" value={options.kind} onChange={(event) => {
        nameGeneratorService.selectKind(event.currentTarget.value as NameOptions['kind']);
        setFeedback(undefined);
      }}>
        <option value="character">Персонаж</option>
        <option value="settlement">Поселение</option>
      </SelectField>
      <div className={styles.fields}>
      <SelectField label="Стиль" value={options.style} onChange={(event) => {
        const style = event.currentTarget.value;
        nameGeneratorService.configure(options.kind === 'character'
          ? { ...options, style: style as CharacterNameStyle }
          : { ...options, style: style as 'russian' | 'english' });
        setFeedback(undefined);
      }}>
        {Object.entries(nameStyles).map(([value, style]) => <option key={value} value={value}>{style.label}</option>)}
      </SelectField>
      {options.kind === 'character' && <>
        <SelectField label="Род" value={options.gender} onChange={(event) => {
          nameGeneratorService.configure({ ...options, gender: event.currentTarget.value as NameGender });
          setFeedback(undefined);
        }}>
          <option value="any">Любой</option><option value="male">Мужской</option><option value="female">Женский</option>
        </SelectField>
      </>}
      </div>
      {options.kind === 'settlement' && options.style === 'english' &&
        <p className={styles.hint}>В скобках — примерный смысл частей названия.</p>}
      {options.kind === 'character' && <Checkbox size="sm" boxPosition="start" label="С фамилией или отчеством" checked={options.withSurname} onChange={(event) => {
          nameGeneratorService.configure({ ...options, withSurname: event.currentTarget.checked });
          setFeedback(undefined);
        }} />}
      <Toolbar>
        <Button size="sm" variant="primary" iconBefore={<Dices size={15} />} onClick={() => {
          nameGeneratorService.regenerate(); setFeedback(undefined);
        }}>Ещё варианты</Button>
      </Toolbar>
      <div role="list" aria-label="Варианты имён" className={styles.results}>
        {results.map((result) => {
          const text = formatGeneratedName(result);
          return <div role="listitem" key={text}>
            <ListItem density="dense" title={<span className={styles.name}>{text}{result.meaning && <>
              {' '}<span className={styles.meaning}>({result.meaning})</span>
            </>}</span>} rightAccessory={
              <IconButton size="xs" variant="ghost" aria-label={`Скопировать ${text}`} title="Скопировать" onClick={() => void copy(text)}><Copy size={14} /></IconButton>
            } />
          </div>;
        })}
      </div>
      <div role="status" aria-live="polite">{feedback && <Notice tone={feedback.error ? 'error' : 'success'}>{feedback.text}</Notice>}</div>
    </section>
  );
}
