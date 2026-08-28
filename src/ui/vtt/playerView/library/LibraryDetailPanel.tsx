/** @jsxImportSource preact */
import { X } from 'lucide-react';
import type { LibraryAdversary } from '../../../../domain/content/types';
import { DAMAGE_TYPE_LABELS, rangeLabel } from '../../../../domain/rules/constants';
import { AssetImage } from '../../../components/common/AssetImage';
import { Button } from '../../../components/common/Button';
import { IconButton } from '../../../components/common/IconButton';
import type { LibraryEntry } from './libraryDetailTypes';
import { RichText } from './RichText';

export function LibraryDetailPanel({
  actionMessage,
  entry,
  onAction,
  onCopy,
  onEdit,
  onClose
}: {
  actionMessage: string;
  entry: LibraryEntry | null;
  onAction: (message: string) => void;
  onCopy?: (editable: NonNullable<LibraryEntry['editable']>) => void;
  onEdit?: (editable: NonNullable<LibraryEntry['editable']>) => void;
  onClose: () => void;
}) {
  if (!entry) return null;

  const hasFooter = entry.actions.length > 0 || Boolean(entry.editable && (onEdit || onCopy)) || Boolean(actionMessage);

  return (
    <aside className={`player-library-detail ${entry.adversary ? 'player-library-detail--adversary' : ''}`.trim()} aria-label="Полная запись компендиума">
      <div className="player-library-detail__body">
        <IconButton
          className="player-library-detail__close"
          type="button"
          variant="ghost"
          size="sm"
          title="Закрыть описание"
          aria-label="Закрыть описание"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </IconButton>
        {entry.adversary ? <AdversaryDetail adversary={entry.adversary} /> : (
          <section className="player-compendium-generic-card">
            <div className={`player-library-detail__header ${entry.imageUrl ? 'player-library-detail__header--with-art' : ''}`}>
              <div className="player-library-detail__identity">
                <span className="player-library-card__kicker">{entry.kicker}</span>
                <h3>{entry.title}</h3>
                {entry.stats.length > 0 && (
                  <div className="player-library-card__stats">
                    {entry.stats.map((stat) => <span key={stat}>{stat}</span>)}
                  </div>
                )}
              </div>
              {entry.imageUrl && (
                <div className="player-library-detail__art" aria-hidden="true">
                  <AssetImage src={entry.imageUrl} alt="" />
                </div>
              )}
            </div>
            <div className="player-library-detail__sections">
              {entry.sections.map((section) => (
                <section className={section.title === 'Свойства' ? 'player-compendium-generic-card__features' : undefined} key={section.title}>
                  {section.title && <h4>{section.title}</h4>}
                  <RichText text={section.body} />
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
      {hasFooter && (
        <footer className="player-library-detail__footer">
          {(entry.actions.length > 0 || entry.editable) && (
            <div className="player-library-detail__actions">
              {entry.editable?.isCustom && onEdit && (
                <Button size="sm" variant="primary" type="button" onClick={() => {
                  if (entry.editable) onEdit(entry.editable);
                }}>
                  Редактировать
                </Button>
              )}
              {entry.editable && !entry.editable.isCustom && onCopy && (
                <Button size="sm" variant="primary" type="button" onClick={() => {
                  if (entry.editable) onCopy(entry.editable);
                }}>
                  Создать копию
                </Button>
              )}
              {entry.actions.map((action) => (
                <Button size="sm" variant="secondary" type="button" key={action.label} disabled={action.disabled} onClick={() => {
                  const message = action.onClick();
                  if (message) onAction(message);
                }}>{action.label}</Button>
              ))}
            </div>
          )}
          {actionMessage && <p className="player-library-detail__status" role="status">{actionMessage}</p>}
        </footer>
      )}
    </aside>
  );
}

function AdversaryDetail({ adversary }: { adversary: LibraryAdversary }) {
  const attack = adversary.attackModifier >= 0 ? `+${adversary.attackModifier}` : String(adversary.attackModifier);
  const damageType = DAMAGE_TYPE_LABELS[adversary.damageType];
  const features = adversary.features;
  return (
    <section className="player-compendium-statblock player-compendium-statblock--readonly" aria-label="Карточка противника">
      <div className={`player-compendium-statblock__identity ${adversary.imageUrl ? '' : 'player-compendium-statblock__identity--no-art'}`.trim()}>
        <div className="player-compendium-statblock__identity-copy">
          <h3 className="player-compendium-statblock__title">{adversary.name}</h3>
          <div className="player-compendium-statblock__meta"><span>Ранг <strong>{adversary.tier}</strong></span><span>Тип <strong>{adversary.roleName}</strong></span></div>
          {adversary.summary && <RichText text={adversary.summary} />}
        </div>
        {adversary.imageUrl && <div className="player-compendium-statblock__art"><AssetImage src={adversary.imageUrl} alt="" /></div>}
      </div>

      {adversary.motives && <div className="player-compendium-statblock__prose"><strong>Мотивы и тактика</strong><span>{adversary.motives}</span></div>}

      <div className="player-compendium-statblock__rules">
        <div className="player-compendium-statblock__line">
          <ReadonlyStat label="Сложность" value={adversary.difficulty} />
          <ReadonlyStat label="Пороги" value={`${adversary.thresholds.major} / ${adversary.thresholds.severe}`} />
          <ReadonlyStat label="Раны" value={adversary.hp} />
          <ReadonlyStat label="Стресс" value={adversary.stress} />
          {adversary.hordePerHp && <ReadonlyStat label="Противников на Рану" value={adversary.hordePerHp} />}
        </div>
        <div className="player-compendium-statblock__line player-compendium-statblock__attack">
          <ReadonlyStat label="Атака" value={attack} />
          <strong className="player-compendium-statblock__weapon">{adversary.weaponName || 'Без названия'}</strong>
          <span>{rangeLabel(adversary.attackRange)}</span>
          <span className="player-compendium-statblock__damage"><strong>{adversary.damageFormula}</strong> {damageType}</span>
        </div>
        {adversary.experiencesText && <div className="player-compendium-statblock__experience"><strong>Опыт</strong><span>{adversary.experiencesText}</span></div>}
      </div>

      {features.length > 0 && (
        <section className="player-compendium-statblock__features">
          <h4>Свойства</h4>
          {features.map((feature, index) => {
            const body = String(feature.main_body ?? feature.text ?? '').trim();
            return <article key={String(feature.id ?? index)}><h5>{feature.name || 'Свойство'}</h5>{body && <RichText text={body} />}</article>;
          })}
        </section>
      )}
    </section>
  );
}

function ReadonlyStat({ label, value }: { label: string; value: string | number }) {
  return <span className="player-compendium-statblock__number"><strong>{label}</strong><span>{value}</span></span>;
}
