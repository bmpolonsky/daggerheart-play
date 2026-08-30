/** @jsxImportSource preact */
import { FileAudio, FileImage, HardDrive, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MapAsset } from '../../../../domain/tabletop/types';
import { assetService, persistenceService } from '../../../../services/serviceRegistry';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Toolbar
} from '../../../components/common';

type AssetFilter = 'all' | 'image' | 'audio';

export function SharedToolsAssetsTab({ assets }: { assets: Record<string, MapAsset> }) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const assetList = useMemo(() => Object.values(assets).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [assets]);
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [query, setQuery] = useState('');
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [pendingDelete, setPendingDelete] = useState<MapAsset | null>(null);

  useEffect(() => { void persistenceService.getWorldAssetUsageCounts().then(setUsageCounts); }, [assets]);

  const visibleAssets = assetList.filter((asset) => {
    const kind = assetKind(asset);
    return (filter === 'all' || kind === filter) && asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const upload = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await assetService.saveFile(file);
    input.value = '';
  };
  const remove = async () => {
    if (!pendingDelete) return;
    await persistenceService.deleteUnusedWorldAsset(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <section className="player-tools-section player-tools-assets-section">
      <SectionHeader
        title="Файлы мира"
        subtitle="Файлы общие для всех игр этого мира"
        actions={(
          <Button size="sm" iconBefore={<Upload size={15} aria-hidden="true" />} onClick={() => fileInput.current?.click()}>
            Загрузить
          </Button>
        )}
      />
      <Toolbar className="player-tools-assets-toolbar" aria-label="Фильтры хранилища">
        <SegmentedControl
          label="Тип файла"
          value={filter}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'image', label: 'Изображения' },
            { value: 'audio', label: 'Музыка' }
          ]}
          onChange={setFilter}
        />
        <SearchField aria-label="Поиск файлов" placeholder="Поиск" value={query} onInput={(event) => setQuery(event.currentTarget.value)} />
      </Toolbar>
      {visibleAssets.length > 0 ? (
        <div className="player-tools-assets-grid">
          {visibleAssets.map((asset) => {
            const kind = assetKind(asset);
            const usages = usageCounts[asset.id] ?? 0;
            return (
              <Card
                className="player-tools-asset-card"
                key={asset.id}
                title={asset.name}
                subtitle={[formatByteCount(asset.byteSize), usages ? `${usages} ${usages === 1 ? 'использование' : 'исп.'}` : 'Не используется'].filter(Boolean).join(' · ')}
                actions={(
                  <IconButton
                    variant="danger"
                    size="sm"
                    disabled={usages > 0}
                    title={usages > 0 ? 'Файл используется в играх мира' : 'Удалить файл'}
                    aria-label={`Удалить ${asset.name}`}
                    onClick={() => setPendingDelete(asset)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                )}
              >
                <AssetPreview asset={asset} kind={kind} />
                <Badge size="xs" tone="neutral">{asset.storage === 'remote' ? 'По ссылке' : kind === 'audio' ? 'Музыка' : kind === 'image' ? 'Изображение' : 'Файл'}</Badge>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<HardDrive size={22} aria-hidden="true" />}
          title={assetList.length ? 'Ничего не найдено' : 'Файлов пока нет'}
          body={assetList.length ? undefined : 'Загрузите файл здесь или при настройке сцены.'}
        />
      )}
      <input ref={fileInput} hidden type="file" accept="image/*,audio/*" onChange={(event) => void upload(event)} />
      {pendingDelete && (
        <ConfirmDialog
          title={`Удалить «${pendingDelete.name}»?`}
          body="Файл будет удалён с этого устройства и из текущего мира."
          confirmLabel="Удалить"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove()}
        />
      )}
    </section>
  );
}

function AssetPreview({ asset, kind }: { asset: MapAsset; kind: ReturnType<typeof assetKind> }) {
  const root = useRef<HTMLDivElement | null>(null);
  const [requested, setRequested] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (kind !== 'image' || requested) return;
    if (typeof IntersectionObserver === 'undefined') {
      setRequested(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setRequested(true);
      observer.disconnect();
    }, { rootMargin: '120px' });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [kind, requested]);

  useEffect(() => {
    if (!requested) return;
    if (asset.storage === 'remote') {
      setUrl(asset.url ?? '');
      return;
    }
    let cancelled = false;
    let objectUrl = '';
    void assetService.getObjectUrl(asset.id).then((nextUrl) => {
      objectUrl = nextUrl ?? '';
      if (!cancelled) setUrl(objectUrl);
      else if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.id, asset.storage, requested]);

  return (
    <div ref={root} className="player-tools-asset-card__preview">
      {kind === 'image' && url && <img src={url} alt="" />}
      {kind === 'audio' && url && <audio controls autoPlay preload="metadata" src={url} />}
      {kind === 'audio' && !url && (
        <Button size="xs" variant="ghost" iconBefore={<FileAudio size={15} />} onClick={() => setRequested(true)}>
          Воспроизвести
        </Button>
      )}
      {kind !== 'audio' && !url && (kind === 'image' ? <FileImage size={26} /> : <HardDrive size={26} />)}
    </div>
  );
}

function assetKind(asset: MapAsset): 'image' | 'audio' | 'other' {
  if (asset.mimeType.startsWith('image/')) return 'image';
  if (asset.mimeType.startsWith('audio/')) return 'audio';
  return 'other';
}

function formatByteCount(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
}
