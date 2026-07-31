/** @jsxImportSource preact */
import { useState } from 'preact/hooks';
import { X } from 'lucide-react';
import type { CharacterCompanionState, DamageType } from '../../../domain/rules/types';
import { Button } from '../../components/common/Button';
import { Dialog } from '../../components/common/Dialog';
import { NumberField, SelectField, TextAreaField, TextField } from '../../components/common/Field';
import { IconButton } from '../../components/common/IconButton';
import { ImageFilePicker } from '../../components/common/ImageFilePicker';
import { SectionHeader } from '../../components/common/SectionHeader';
import { Toolbar } from '../../components/common/Toolbar';
import { readFileAsDataUrl } from './sharedTools/readFileAsDataUrl';

export function CompanionEditorDialog({
  companion,
  onClose,
  onSave
}: {
  companion: CharacterCompanionState | null;
  onClose: () => void;
  onSave: (input: Partial<CharacterCompanionState>) => void;
}) {
  const [name, setName] = useState(companion?.name ?? '');
  const [imageUrl, setImageUrl] = useState(companion?.imageUrl ?? '');
  const [evasion, setEvasion] = useState(companion?.evasion ?? 10);
  const [stressMax, setStressMax] = useState(companion?.stress.max ?? 3);
  const [attackName, setAttackName] = useState(companion?.attackName ?? 'Обычная атака');
  const [attackRange, setAttackRange] = useState(companion?.attackRange ?? 'Вплотную');
  const [attackFormula, setAttackFormula] = useState(companion?.attackFormula ?? '1d6');
  const [attackDamageType, setAttackDamageType] = useState<DamageType>(companion?.attackDamageType ?? 'physical');
  const [firstExperience, setFirstExperience] = useState(companion?.experiences[0]?.name ?? '');
  const [secondExperience, setSecondExperience] = useState(companion?.experiences[1]?.name ?? '');
  const [notes, setNotes] = useState(companion?.notes ?? '');
  const canSave = name.trim().length > 0 && firstExperience.trim().length > 0 && secondExperience.trim().length > 0;

  return (
    <Dialog className="player-companion-editor" aria-label={companion ? `Редактирование компаньона ${companion.name}` : 'Новый компаньон'} onClose={onClose}>
      <SectionHeader
        title={companion ? 'Редактировать компаньона' : 'Создать компаньона'}
        actions={(
          <IconButton size="sm" variant="ghost" title="Закрыть" aria-label="Закрыть редактор компаньона" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        )}
      />
      <div className="player-companion-editor__body">
        <ImageFilePicker
          label="Изображение компаньона"
          imageUrl={imageUrl}
          aspectRatio="1 / 1"
          size="compact"
          onFileSelect={async (file) => setImageUrl(await readFileAsDataUrl(file))}
          onClear={() => setImageUrl('')}
        />
        <div className="player-companion-editor__fields">
          <TextField autoFocus label="Имя" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <div className="player-companion-editor__grid">
            <NumberField label="Уклонение" min={0} max={99} value={evasion} onChange={(event) => setEvasion(event.currentTarget.valueAsNumber)} />
            <NumberField label="Ячейки стресса" min={0} max={12} value={stressMax} onChange={(event) => setStressMax(event.currentTarget.valueAsNumber)} />
          </div>
          <div className="player-companion-editor__grid">
            <TextField label="Название атаки" value={attackName} onChange={(event) => setAttackName(event.currentTarget.value)} />
            <TextField label="Дистанция" value={attackRange} onChange={(event) => setAttackRange(event.currentTarget.value)} />
          </div>
          <div className="player-companion-editor__grid">
            <TextField label="Кость урона" value={attackFormula} onChange={(event) => setAttackFormula(event.currentTarget.value)} />
            <SelectField label="Тип урона" value={attackDamageType} onChange={(event) => setAttackDamageType(event.currentTarget.value as DamageType)}>
              <option value="physical">Физический</option>
              <option value="magic">Магический</option>
            </SelectField>
          </div>
          <div className="player-companion-editor__grid">
            <TextField label="Опыт компаньона 1" value={firstExperience} onChange={(event) => setFirstExperience(event.currentTarget.value)} />
            <TextField label="Опыт компаньона 2" value={secondExperience} onChange={(event) => setSecondExperience(event.currentTarget.value)} />
          </div>
          <TextAreaField label="Заметки" rows={3} value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
        </div>
      </div>
      <Toolbar className="player-companion-editor__actions" aria-label="Сохранение компаньона">
        <Button size="sm" variant="ghost" onClick={onClose}>Отмена</Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!canSave}
          onClick={() => onSave({
            name: name.trim(),
            imageUrl,
            evasion,
            stress: { marked: companion?.stress.marked ?? 0, max: stressMax },
            attackName: attackName.trim(),
            attackRange: attackRange.trim(),
            attackFormula: attackFormula.trim(),
            attackDamageType,
            experiences: [
              { id: companion?.experiences[0]?.id ?? 'companion-exp-1', name: firstExperience.trim(), modifier: companion?.experiences[0]?.modifier ?? 2 },
              { id: companion?.experiences[1]?.id ?? 'companion-exp-2', name: secondExperience.trim(), modifier: companion?.experiences[1]?.modifier ?? 2 }
            ],
            notes: notes.trim()
          })}
        >
          Сохранить
        </Button>
      </Toolbar>
    </Dialog>
  );
}
