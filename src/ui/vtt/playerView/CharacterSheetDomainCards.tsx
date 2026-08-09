/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole, MoreHorizontal, Sparkles, X } from 'lucide-react';
import { domainCardRecallStressCost, planDomainCardMove, type DomainCardMoveContext } from '../../../domain/rules/cardLoadout';
import type { CharacterUsageTracker } from '../../../domain/rules/types';
import { characterService } from '../../../services/serviceRegistry';
import { UsageTrackerControl } from '../../characters/UsageTrackerControl';
import { AssetImage } from '../../components/common/AssetImage';
import { Button } from '../../components/common/Button';
import { Checkbox } from '../../components/common/Checkbox';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Dialog } from '../../components/common/Dialog';
import { IconButton } from '../../components/common/IconButton';
import { ListItem } from '../../components/common/ListItem';
import { Notice } from '../../components/common/Notice';
import { RichChoicePicker } from '../../components/common/RichChoicePicker';
import { SectionHeader } from '../../components/common/SectionHeader';
import { TrackDots } from './PlayerSheetControls';
import type { PlayerViewDomainCard } from './domainCards/types';

interface PendingRecall {
  cardId: string;
  context: DomainCardMoveContext;
  replaceCardId: string;
}

export function CharacterSheetDomainCards({
  characterId,
  cards,
  handLimit,
  usageTrackers,
  onPreview,
  onTokenChange
}: {
  characterId: string;
  cards: PlayerViewDomainCard[];
  handLimit: number;
  usageTrackers: CharacterUsageTracker[];
  onPreview: (cardId: string) => void;
  onTokenChange: (cardId: string, value: number) => void;
}) {
  const [pendingRecall, setPendingRecall] = useState<PendingRecall | null>(null);
  const [permanentCandidate, setPermanentCandidate] = useState<PlayerViewDomainCard | null>(null);
  const hand = cards.filter((card) => card.inHand);
  const vault = cards.filter((card) => !card.inHand);
  const fullCharacter = characterService.getCharacter(characterId);
  const plan = useMemo(() => {
    if (!pendingRecall || !fullCharacter) return null;
    return planDomainCardMove(fullCharacter, {
      cardId: pendingRecall.cardId,
      to: 'hand',
      context: pendingRecall.context,
      replaceCardId: pendingRecall.replaceCardId || undefined
    });
  }, [fullCharacter, pendingRecall]);
  const recalledCard = pendingRecall ? cards.find((card) => card.id === pendingRecall.cardId) ?? null : null;
  const resolvingAcquisition = Boolean(recalledCard?.loadoutChoicePending);

  const sendToVault = (cardId: string) => {
    characterService.moveDomainCard(characterId, { cardId, to: 'vault', context: 'adventure' });
  };
  const beginRecall = (card: PlayerViewDomainCard) => {
    if (!fullCharacter) return;
    const needsReplacement = hand.length >= handLimit;
    if (!needsReplacement && domainCardRecallStressCost(card) === 0) {
      characterService.moveDomainCard(characterId, { cardId: card.id, to: 'hand', context: 'adventure' });
      return;
    }
    setPendingRecall({ cardId: card.id, context: 'adventure', replaceCardId: '' });
  };
  const recall = () => {
    if (!pendingRecall || !plan?.canApply) return;
    characterService.moveDomainCard(characterId, {
      cardId: pendingRecall.cardId,
      to: 'hand',
      context: pendingRecall.context,
      replaceCardId: pendingRecall.replaceCardId || undefined
    });
    setPendingRecall(null);
  };
  const keepNewCardInVault = () => {
    if (!pendingRecall || !resolvingAcquisition) return;
    characterService.moveDomainCard(characterId, {
      cardId: pendingRecall.cardId,
      to: 'vault',
      context: 'levelUp'
    });
    setPendingRecall(null);
  };
  const permanentlyVault = () => {
    if (!permanentCandidate) return;
    characterService.permanentlyVaultDomainCard(characterId, permanentCandidate.id);
    setPermanentCandidate(null);
  };

  return (
    <div className="player-domain-card-zones">
      <section className="player-domain-card-zone" aria-label="Рука карт доменов">
        <SectionHeader title="Рука" subtitle={`${hand.length}/${handLimit}`} />
        {hand.map((card) => (
          <DomainCardRow
            key={card.id}
            card={card}
            tracker={usageTrackers.find((item) => item.targetKind === 'card' && item.targetId === card.id)}
            characterId={characterId}
            action={(
              <Button size="xs" variant="ghost" title="Переместить в Хранилище" iconBefore={<ArrowDownToLine size={12} aria-hidden="true" />} onClick={(event) => { event.stopPropagation(); sendToVault(card.id); }}>
                В Хранилище
              </Button>
            )}
            onPreview={onPreview}
            onTokenChange={onTokenChange}
          />
        ))}
      </section>
      {vault.length > 0 && (
        <section className="player-domain-card-zone" aria-label="Хранилище карт доменов">
          <SectionHeader title="Хранилище" subtitle={`${vault.length}`} />
          {vault.map((card) => (
            <DomainCardRow
              key={card.id}
              card={card}
              tracker={usageTrackers.find((item) => item.targetKind === 'card' && item.targetId === card.id)}
              characterId={characterId}
              action={card.permanentlyVaulted ? undefined : card.loadoutChoicePending ? (
                <Button size="xs" variant="secondary" title="Выбрать место новой карты" iconBefore={<Sparkles size={12} aria-hidden="true" />} onClick={(event) => {
                  event.stopPropagation();
                  setPendingRecall({ cardId: card.id, context: 'levelUp', replaceCardId: '' });
                }}>
                  Выбрать
                </Button>
              ) : (
                <>
                  <Button size="xs" variant="ghost" title="Вернуть в Руку" iconBefore={<ArrowUpFromLine size={12} aria-hidden="true" />} onClick={(event) => {
                    event.stopPropagation();
                    beginRecall(card);
                  }}>
                    В Руку
                  </Button>
                  <details className="player-domain-card-more" onClick={(event) => event.stopPropagation()}>
                    <summary aria-label={`Другие действия карты ${card.name}`} title="Другие действия">
                      <MoreHorizontal size={15} aria-hidden="true" />
                    </summary>
                    <div className="player-domain-card-more__menu">
                      <Button size="xs" variant="danger" iconBefore={<LockKeyhole size={12} aria-hidden="true" />} onClick={(event) => {
                        event.stopPropagation();
                        (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                        setPermanentCandidate(card);
                      }}>
                        Убрать навсегда
                      </Button>
                    </div>
                  </details>
                </>
              )}
              status={card.permanentlyVaulted ? 'Навсегда — вернуть нельзя' : card.loadoutChoicePending ? 'Новая — ждёт выбора' : undefined}
              onPreview={onPreview}
              onTokenChange={onTokenChange}
            />
          ))}
        </section>
      )}
      {pendingRecall && recalledCard && fullCharacter && plan && (
        <Dialog
          className="player-domain-card-recall"
          aria-label={resolvingAcquisition ? `Новая карта: ${recalledCard.name}` : `Вернуть в Руку: ${recalledCard.name}`}
          onClose={() => setPendingRecall(null)}
        >
          <SectionHeader
            title={resolvingAcquisition ? `Новая карта: ${recalledCard.name}` : recalledCard.name}
            actions={(
              <IconButton variant="ghost" size="sm" title="Закрыть" aria-label="Закрыть перемещение карты" onClick={() => setPendingRecall(null)}>
                <X size={16} aria-hidden="true" />
              </IconButton>
            )}
          />
          {resolvingAcquisition ? (
            <Notice tone="info">Новая карта остаётся в Хранилище или бесплатно заменяет одну карту в полной Руке.</Notice>
          ) : plan.stressCost > 0 ? (
            <Notice tone="info">Цена возврата: {plan.stressCost} Стресс.</Notice>
          ) : null}
          {!resolvingAcquisition && domainCardRecallStressCost(recalledCard) > 0 && (
            <Checkbox
              layout="row"
              checked={pendingRecall.context === 'rest'}
              label="Во время отдыха — без Стресса"
              onChange={(event) => setPendingRecall((current) => current ? {
                ...current,
                context: event.currentTarget.checked ? 'rest' : 'adventure'
              } : current)}
            />
          )}
          {plan.handSize >= plan.handLimit && (
            <RichChoicePicker
              label="Заменить карту в Руке"
              value={pendingRecall.replaceCardId}
              placeholder="Выберите карту"
              items={hand.map((card) => ({
                id: card.id,
                title: card.name,
                subtitle: `${card.domainLabel} ${card.level}`,
                description: card.text,
                imageUrl: card.imageUrl
              }))}
              onChange={(itemId) => setPendingRecall((current) => current ? { ...current, replaceCardId: itemId } : current)}
            />
          )}
          {plan.issues.length > 0 && <p className="form-hint">{plan.issues.map((issue) => issue.message).join(' ')}</p>}
          {plan.stressCost > 0 && <p className="form-hint">После возврата будет отмечен Стресс: {plan.stressCost}.</p>}
          <div className="player-domain-card-dialog-actions">
            <Button onClick={() => setPendingRecall(null)}>Отмена</Button>
            {resolvingAcquisition && <Button onClick={keepNewCardInVault}>Оставить в Хранилище</Button>}
            <Button variant="primary" disabled={!plan.canApply} onClick={recall}>
              {resolvingAcquisition ? (plan.handSize >= plan.handLimit ? 'Заменить в Руке' : 'Добавить в Руку') : 'Вернуть в Руку'}
            </Button>
          </div>
        </Dialog>
      )}
      {permanentCandidate && (
        <ConfirmDialog
          title={`Навсегда убрать «${permanentCandidate.name}»?`}
          body="Карта останется в Хранилище, и обычным действием вернуть её больше нельзя. Отмена останется доступна в Истории листа."
          confirmLabel="Убрать навсегда"
          onCancel={() => setPermanentCandidate(null)}
          onConfirm={permanentlyVault}
        />
      )}
    </div>
  );
}

function DomainCardRow({
  characterId,
  card,
  tracker,
  action,
  status,
  onPreview,
  onTokenChange
}: {
  characterId: string;
  card: PlayerViewDomainCard;
  tracker?: CharacterUsageTracker;
  action?: ComponentChildren;
  status?: string;
  onPreview: (cardId: string) => void;
  onTokenChange: (cardId: string, value: number) => void;
}) {
  return (
    <ListItem
      className="player-domain-card-row"
      align="start"
      tone={card.inHand ? 'featured' : 'default'}
      title={card.name}
      subtitle={`${card.domainLabel} ${card.level}${status ? ` — ${status}` : ''}`}
      leftAccessory={card.imageUrl ? <AssetImage className="player-domain-card-thumb" src={card.imageUrl} alt="" /> : undefined}
      rightAccessory={(
        <div className="player-domain-card-row-controls">
          {card.tokens.max > 0 && (
            <TrackDots
              value={card.tokens.value}
              max={card.tokens.max}
              tone="hope"
              label={`Надежда карты ${card.name}`}
              onSet={(next) => onTokenChange(card.id, next)}
            />
          )}
          <div className="player-domain-card-row-actions">
            {(tracker || card.tokens.max <= 0) && (
              <UsageTrackerControl
                compact
                characterId={characterId}
                targetKind="card"
                targetId={card.id}
                targetName={card.name}
                tracker={tracker}
              />
            )}
            {action}
          </div>
        </div>
      )}
      onClick={() => onPreview(card.id)}
    />
  );
}
