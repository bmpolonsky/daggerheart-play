/** @jsxImportSource preact */
import { ArrowDownToLine, ArrowUpFromLine, Ellipsis, Eye, EyeOff, LockKeyhole, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { characterHandSize } from '../../../domain/rules/characterRuleModifiers';
import { domainCardRecallStressCost, planDomainCardMove, type DomainCardMoveContext } from '../../../domain/rules/cardLoadout';
import { domainLabel } from '../../../domain/rules/constants';
import { featureUsageSuggestion } from '../../../domain/rules/featureEffects';
import type { Character, DomainCardRecord } from '../../../domain/rules/types';
import type { TableFeedItem } from '../../../domain/tabletop/feed';
import { characterService, gameService } from '../../../services/serviceRegistry';
import { UsageTrackerControl } from '../../characters/UsageTrackerControl';
import { ActionMenu, Badge, Button, Checkbox, ConfirmDialog, Dialog, IconButton, Notice, RichChoicePicker, SectionHeader, Surface } from '../../components/common';
import { TrackDots } from './PlayerSheetControls';
import type { TableViewRole } from './types';
import { FeedCard } from './playerChrome/feedCards/FeedCard';

interface PendingRecall {
  cardId: string;
  context: DomainCardMoveContext;
  replaceCardId: string;
}

export function ContentPreviewPanel({ item, mobile, role, onClose, onEditHandout }: {
  item: TableFeedItem;
  mobile: boolean;
  role: TableViewRole;
  onClose: () => void;
  onEditHandout?: (handoutId: string) => void;
}) {
  const characters = useStream(characterService.characters$);
  const character = item.actor?.actorId ? characters.entities[item.actor.actorId] : null;
  const card = item.card && character ? character.domainCards.find((candidate) => candidate.id === item.card?.id) : null;
  const inventoryItem = item.kind === 'feature' && item.feature?.sourceLabel === 'Инвентарь'
    ? character?.inventory.find((candidate) => candidate.id === item.feature?.id)
    : null;
  const trackerTarget = item.kind === 'feature' ? item.feature : item.kind === 'card' ? item.card : null;
  const tracker = trackerTarget && character?.usageTrackers?.find((candidate) => (
    candidate.targetKind === item.kind && candidate.targetId === trackerTarget.id
  )) || undefined;
  const suggestedUsage = trackerTarget ? featureUsageSuggestion(
    trackerTarget.text,
    trackerTarget.name,
    item.kind === 'feature' ? character?.sheetCards.map((feature) => ({ name: feature.name, text: feature.text ?? '' })) : []
  ) : null;

  useEffect(() => {
    if (mobile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobile, onClose]);

  const content = (
    <>
      <IconButton className="player-content-preview__close" variant="ghost" size="sm" title="Закрыть" aria-label="Закрыть предпросмотр" onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </IconButton>
      <div className="player-content-preview__body">
        <article className={`player-activity-event player-activity-event--${item.kind} player-activity-event--${item.tone} player-activity-event--ephemeral`}>
          <FeedCard
            actorId={item.actor?.actorId ?? null}
            item={item}
            waitingForResult={false}
            role={role}
            onRevealToPublic={() => undefined}
            onHandoutPublish={onClose}
          />
          {character && card && <DomainCardPreviewControls character={character} card={card} />}
          {character && inventoryItem?.kind === 'consumable' && (
            <div className="player-content-preview__actions">
              <Button variant="primary" size="sm" disabled={!canUseInventoryItem(inventoryItem)} onClick={() => characterService.useInventoryItem(character.id, inventoryItem.id)}>
                Использовать
              </Button>
            </div>
          )}
          {character && trackerTarget && (
            <div className="player-content-preview__controls">
              {item.kind === 'card' && item.card && item.card.tokens.max > 0 && (
                <TrackDots
                  value={Math.min(card?.tokens.value ?? item.card.tokens.value, item.card.tokens.max)}
                  max={item.card.tokens.max}
                  tone="hope"
                  label={`Надежда карты ${item.card.name}`}
                  onSet={(value) => characterService.updateDomainCardTokens(character.id, item.card!.id, value)}
                />
              )}
              {(item.kind !== 'card' || (item.card?.tokens.max ?? 0) <= 0 || tracker) && (
                <UsageTrackerControl
                  characterId={character.id}
                  targetKind={item.kind === 'card' ? 'card' : 'feature'}
                  targetId={trackerTarget.id}
                  targetName={trackerTarget.name}
                  tracker={tracker}
                  suggestedUsage={suggestedUsage}
                />
              )}
            </div>
          )}
          {role === 'gm' && item.kind === 'handout' && item.handout && (
            <HandoutPreviewControls handoutId={item.handout.id} onClose={onClose} onEdit={onEditHandout} />
          )}
        </article>
      </div>
    </>
  );

  if (mobile) {
    return <Dialog className="player-content-preview-dialog" aria-label="Предпросмотр" onClose={onClose}>{content}</Dialog>;
  }
  return <Surface as="aside" className="player-content-preview" tone="solid" padding="none" aria-label="Предпросмотр">{content}</Surface>;
}

function DomainCardPreviewControls({ character, card }: { character: Character; card: DomainCardRecord }) {
  const [pendingRecall, setPendingRecall] = useState<PendingRecall | null>(null);
  const [permanentCandidate, setPermanentCandidate] = useState(false);
  const hand = character.domainCards.filter((candidate) => Boolean(candidate.inLoadout) && !candidate.permanentlyVaulted);
  const handLimit = characterHandSize(character.ruleModifiers);
  const inHand = Boolean(card.inLoadout) && !card.permanentlyVaulted;
  const resolvingAcquisition = Boolean(card.loadoutChoicePending);
  const plan = useMemo(() => pendingRecall ? planDomainCardMove(character, {
    cardId: pendingRecall.cardId,
    to: 'hand',
    context: pendingRecall.context,
    replaceCardId: pendingRecall.replaceCardId || undefined
  }) : null, [character, pendingRecall]);

  const beginRecall = () => {
    if (hand.length < handLimit && domainCardRecallStressCost(card) === 0) {
      characterService.moveDomainCard(character.id, { cardId: card.id, to: 'hand', context: 'adventure' });
      return;
    }
    setPendingRecall({ cardId: card.id, context: 'adventure', replaceCardId: '' });
  };
  const recall = () => {
    if (!pendingRecall || !plan?.canApply) return;
    characterService.moveDomainCard(character.id, {
      cardId: card.id,
      to: 'hand',
      context: pendingRecall.context,
      replaceCardId: pendingRecall.replaceCardId || undefined
    });
    setPendingRecall(null);
  };

  return (
    <>
      <div className="player-content-preview__actions">
        {card.permanentlyVaulted ? <Badge>Навсегда в Хранилище</Badge> : inHand ? (
          <Button size="sm" variant="secondary" iconBefore={<ArrowDownToLine size={14} aria-hidden="true" />} onClick={() => characterService.moveDomainCard(character.id, { cardId: card.id, to: 'vault', context: 'adventure' })}>
            В Хранилище
          </Button>
        ) : resolvingAcquisition ? (
          <Button size="sm" variant="primary" iconBefore={<Sparkles size={14} aria-hidden="true" />} onClick={() => setPendingRecall({ cardId: card.id, context: 'levelUp', replaceCardId: '' })}>
            Выбрать
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" iconBefore={<ArrowUpFromLine size={14} aria-hidden="true" />} onClick={beginRecall}>В Руку</Button>
            <ActionMenu
              ariaLabel={`Другие действия карты ${card.name}`}
              items={[{ id: 'permanent', label: 'Убрать навсегда', icon: <LockKeyhole size={14} />, onSelect: () => setPermanentCandidate(true) }]}
              renderTrigger={(props) => <IconButton {...props} size="sm" variant="ghost" title="Другие действия" aria-label={`Другие действия карты ${card.name}`}><Ellipsis size={15} /></IconButton>}
            />
          </>
        )}
      </div>
      {pendingRecall && plan && (
        <Dialog className="player-domain-card-recall" aria-label={resolvingAcquisition ? `Новая карта: ${card.name}` : `Вернуть в Руку: ${card.name}`} onClose={() => setPendingRecall(null)}>
          <SectionHeader title={resolvingAcquisition ? `Новая карта: ${card.name}` : card.name} actions={<IconButton variant="ghost" size="sm" title="Закрыть" aria-label="Закрыть перемещение карты" onClick={() => setPendingRecall(null)}><X size={16} /></IconButton>} />
          {resolvingAcquisition ? <Notice tone="info">Новая карта остаётся в Хранилище или бесплатно заменяет одну карту в полной Руке.</Notice> : plan.stressCost > 0 ? <Notice tone="info">Цена возврата: {plan.stressCost} Стресс.</Notice> : null}
          {!resolvingAcquisition && domainCardRecallStressCost(card) > 0 && (
            <Checkbox layout="row" checked={pendingRecall.context === 'rest'} label="Во время отдыха — без Стресса" onChange={(event) => setPendingRecall((current) => current ? { ...current, context: event.currentTarget.checked ? 'rest' : 'adventure' } : current)} />
          )}
          {plan.handSize >= plan.handLimit && (
            <RichChoicePicker
              label="Заменить карту в Руке"
              value={pendingRecall.replaceCardId}
              placeholder="Выберите карту"
              items={hand.map((candidate) => ({ id: candidate.id, title: candidate.name, subtitle: `${domainLabel(candidate.domain)} ${candidate.level}`, description: candidate.text, imageUrl: candidate.imageUrl ?? '' }))}
              onChange={(itemId) => setPendingRecall((current) => current ? { ...current, replaceCardId: itemId } : current)}
            />
          )}
          {plan.issues.length > 0 && <p className="form-hint">{plan.issues.map((issue) => issue.message).join(' ')}</p>}
          <div className="player-domain-card-dialog-actions">
            <Button onClick={() => setPendingRecall(null)}>Отмена</Button>
            {resolvingAcquisition && <Button onClick={() => { characterService.moveDomainCard(character.id, { cardId: card.id, to: 'vault', context: 'levelUp' }); setPendingRecall(null); }}>Оставить в Хранилище</Button>}
            <Button variant="primary" disabled={!plan.canApply} onClick={recall}>{resolvingAcquisition ? (plan.handSize >= plan.handLimit ? 'Заменить в Руке' : 'Добавить в Руку') : 'Вернуть в Руку'}</Button>
          </div>
        </Dialog>
      )}
      {permanentCandidate && (
        <ConfirmDialog
          title={`Навсегда убрать «${card.name}»?`}
          body="Карта останется в Хранилище, и обычным действием вернуть её больше нельзя. Отмена останется доступна в Истории листа."
          confirmLabel="Убрать навсегда"
          onCancel={() => setPermanentCandidate(false)}
          onConfirm={() => { characterService.permanentlyVaultDomainCard(character.id, card.id); setPermanentCandidate(false); }}
        />
      )}
    </>
  );
}

function HandoutPreviewControls({ handoutId, onClose, onEdit }: { handoutId: string; onClose: () => void; onEdit?: (handoutId: string) => void }) {
  const game = useStream(gameService.game$);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const handout = game.handouts.find((candidate) => candidate.id === handoutId);
  if (!handout) return null;
  const presented = game.presentedHandoutId === handout.id && handout.visibleToPlayers;
  return (
    <>
      <div className="player-content-preview__actions">
        {presented && <Badge tone="gold">На столе</Badge>}
        <Button size="sm" variant={presented ? 'ghost' : 'primary'} iconBefore={presented ? <EyeOff size={14} /> : <Eye size={14} />} onClick={() => presented ? gameService.hidePresentedHandout() : gameService.presentHandout(handout.id)}>
          {presented ? 'Убрать со стола' : 'Показать на столе'}
        </Button>
        <ActionMenu
          ariaLabel={`Действия: ${handout.title || 'Без названия'}`}
          items={[
            { id: 'edit', label: 'Редактировать', icon: <Pencil size={14} />, disabled: !onEdit, onSelect: () => { onClose(); onEdit?.(handout.id); } },
            { id: 'delete', label: 'Удалить', icon: <Trash2 size={14} />, onSelect: () => setDeleteOpen(true) }
          ]}
          renderTrigger={(props) => <IconButton {...props} size="sm" variant="ghost" title="Действия" aria-label={`Действия: ${handout.title || 'Без названия'}`}><Ellipsis size={15} /></IconButton>}
        />
      </div>
      {deleteOpen && <ConfirmDialog title={`Удалить «${handout.title || 'Без названия'}»?`} body="Раздатка исчезнет у мастера и игроков. Это действие нельзя отменить." onCancel={() => setDeleteOpen(false)} onConfirm={() => { gameService.removeHandout(handout.id); onClose(); }} />}
    </>
  );
}

function canUseInventoryItem(item: Character['inventory'][number]): boolean {
  if (item.quantity <= 0) return false;
  return item.uses ? item.uses.current > 0 || item.quantity > 1 : true;
}
