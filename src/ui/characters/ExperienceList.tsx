import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/common/Button';
import { NumberControl, TextControl } from '../components/common/Field';
import { IconButton } from '../components/common/IconButton';
import type { Character } from '../../domain/rules/types';
import { characterService } from '../../services/serviceRegistry';

export function ExperienceList({ character }: { character: Character }) {
  return (
    <div className="experience-editor">
      <div className="row-end">
        <Button onClick={() => characterService.addExperience(character.id)}>
          <Plus size={15} /> Опыт
        </Button>
      </div>
      {character.experiences.map((experience) => (
        <div key={experience.id} className="experience-row">
          <TextControl
            aria-label="Название опыта"
            value={experience.name}
            onChange={(event) => characterService.updateExperience(character.id, experience.id, { name: event.currentTarget.value })}
          />
          <NumberControl
            className="experience-row__modifier"
            aria-label="Модификатор опыта"
            value={experience.modifier}
            onChange={(event) => characterService.updateExperience(character.id, experience.id, { modifier: Number(event.currentTarget.value) })}
          />
          <TextControl
            aria-label="Заметки опыта"
            placeholder="Заметки"
            value={experience.notes ?? ''}
            onChange={(event) => characterService.updateExperience(character.id, experience.id, { notes: event.currentTarget.value })}
          />
          <IconButton variant="danger" size="sm" type="button" title="Удалить опыт" aria-label={`Удалить опыт ${experience.name}`} onClick={() => characterService.removeExperience(character.id, experience.id)}>
            <Trash2 size={15} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
