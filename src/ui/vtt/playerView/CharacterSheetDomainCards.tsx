/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { ArrowDownToLine, ArrowUpFromLine, LockKeyhole, Sparkles, X } from 'lucide-react';
import { planDomainCardMove, type DomainCardMoveContext } from '../../../domain/rules/cardLoadout';
import type { CharacterUsageTracker } from '../../../domain/rules/types';
import { characterService } from '../../../services/serviceRegistry';
import { UsageTrackerControl } from '../../characters/UsageTrackerControl';
import { AssetImage } from '../../components/common/AssetImage';
import { Button } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Dialog } from '../../components/common/Dialog';
import { SelectField } from '../../components/common/Field';
import { IconButton } from '../../components/common/IconButton';
import { ListItem } from '../../components/common/ListItem';
import { Notice } from '../../components/common/Notice';
import { SectionHeader } from '../../components/common/SectionHeader';
import { SegmentedControl } from '../../components/common/SegmentedControl';
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
                    setPendingRecall({ cardId: card.id, context: 'adventure', replaceCardId: '' });
                  }}>
                    В Руку
                  </Button>
                  <Button size="xs" variant="ghost" title="Навсегда оставить в Хранилище" iconBefore={<LockKeyhole size={12} aria-hidden="true" />} onClick={(event) => {
                    event.stopPropagation();
                    setPermanentCandidate(card);
                  }}>
                    Навсегда
                  </Button>
                </>
              )}
              status={card.permanentlyVaulted ? 'Навсегда · вернуть нельзя' : card.loadoutChoicePending ? 'Новая · ждёт выбора' : undefined}
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
          ) : (
            <SegmentedControl
              label="Когда меняется Рука"
              value={pendingRecall.context === 'rest' ? 'rest' : 'adventure'}
              options={[
                { value: 'adventure', label: 'Во время приключения' },
                { value: 'rest', label: 'Во время отдыха' }
              ]}
              onChange={(context) => setPendingRecall((current) => current ? { ...current, context } : current)}
            />
          )}
          {plan.handSize >= plan.handLimit && (
            <SelectField
              label="Заменить карту в Руке"
              value={pendingRecall.replaceCardId}
              onChange={(event) => setPendingRecall((current) => current ? { ...current, replaceCardId: event.currentTarget.value } : current)}
            >
              <option value="">Выберите карту</option>
              {hand.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
            </SelectField>
          )}
          {plan.issues.length > 0 && <p className="form-hint">{plan.issues.map((issue) => issue.message).join(' ')}</p>}
          {plan.stressCost > 0 && <p className="form-hint">Будет отмечен Стресс: {plan.stressCost}.</p>}
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
          body="Карта останется в Хранилище, но вернуть её в Руку больше нельзя. Это действие необратимо."
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
      align="start"
      tone={card.inHand ? 'featured' : 'default'}
      title={card.name}
      subtitle={`${card.domainLabel} ${card.level}${status ? ` · ${status}` : ''}`}
      leftAccessory={card.imageUrl ? <AssetImage className="player-domain-card-thumb" src={card.imageUrl} alt="" /> : undefined}
      detail={card.tokens.max > 0 && (
        <TrackDots
          value={card.tokens.value}
          max={card.tokens.max}
          tone="hope"
          label={`Надежда карты ${card.name}`}
          onSet={(next) => onTokenChange(card.id, next)}
        />
      )}
      rightAccessory={(
        <div className="player-domain-card-row-actions">
          <UsageTrackerControl
            compact
            characterId={characterId}
            targetKind="card"
            targetId={card.id}
            targetName={card.name}
            tracker={tracker}
          />
          {action}
        </div>
      )}
      onClick={() => onPreview(card.id)}
    />
  );
}
