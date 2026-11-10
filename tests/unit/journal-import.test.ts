import { describe, expect, it } from 'vitest';
import { ImportExportService } from '../../src/services/ImportExportService';
import { PersistenceService } from '../../src/services/PersistenceService';
import { clearTechnicalJournal, getTechnicalJournal } from '../../src/core/observability/technicalJournal';

describe('Import journal integration', () => {
  it('records validation rejection without logging filename, JSON or error text', async () => {
    clearTechnicalJournal();
    const service = new ImportExportService(undefined, new PersistenceService(null));
    expect((await service.importJson('{PRIVATE invalid')).ok).toBe(false);
    const events = getTechnicalJournal().filter(event => event.area === 'import');
    expect(events.map(event => event.phase)).toEqual(['running', 'failed']);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });
  it('records successful JSON import', async () => {
    clearTechnicalJournal();
    const service = new ImportExportService(undefined, new PersistenceService(null));
    expect((await service.importJson(service.exportJson())).ok).toBe(true);
    expect(getTechnicalJournal().filter(event => event.area === 'import').map(event => event.phase)).toEqual(['running', 'succeeded']);
  });
  it('does not swallow failed application errors', async () => {
    clearTechnicalJournal();
    const persistence = new PersistenceService(null);
    const error = new Error('PRIVATE disk failure');
    persistence.importGameDocument = async () => { throw error; };
    const service = new ImportExportService(undefined, persistence);
    await expect(service.importJson(service.exportJson())).rejects.toBe(error);
    const events = getTechnicalJournal().filter(event => event.area === 'import');
    expect(events.map(event => event.phase)).toEqual(['running', 'failed']);
    expect(JSON.stringify(events)).not.toContain('PRIVATE');
  });
});
