import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformSettingsModel } from '../../models/platformSettings.model.js';
import { platformSettingsRepository } from '../platformSettingsRepository.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('platformSettingsRepository.getOrCreateDefaults', () => {
  it('returns the existing row if one already exists', async () => {
    const findSpy = vi
      .spyOn(PlatformSettingsModel, 'findOne')
      .mockReturnValue({ exec: async () => ({ platformName: 'Existing' }) } as ReturnType<
        typeof PlatformSettingsModel.findOne
      >);
    const createSpy = vi.spyOn(PlatformSettingsModel, 'create');

    const result = await platformSettingsRepository.getOrCreateDefaults();

    expect(result).toEqual({ platformName: 'Existing' });
    expect(createSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
  });

  it('creates defaults if no row exists yet', async () => {
    const findSpy = vi
      .spyOn(PlatformSettingsModel, 'findOne')
      .mockReturnValue({ exec: async () => null } as ReturnType<
        typeof PlatformSettingsModel.findOne
      >);
    const createSpy = vi
      .spyOn(PlatformSettingsModel, 'create')
      .mockResolvedValue({ platformName: 'BeautyBook' } as never);

    const result = await platformSettingsRepository.getOrCreateDefaults();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ platformName: 'BeautyBook', defaultCurrency: 'NOK' }),
    );
    expect(result).toEqual({ platformName: 'BeautyBook' });
    findSpy.mockRestore();
  });
});

describe('platformSettingsRepository.update', () => {
  it('ensures a row exists, then applies $set updates', async () => {
    const findSpy = vi
      .spyOn(PlatformSettingsModel, 'findOne')
      .mockReturnValue({ exec: async () => ({ platformName: 'BeautyBook' }) } as ReturnType<
        typeof PlatformSettingsModel.findOne
      >);
    const updateSpy = vi.spyOn(PlatformSettingsModel, 'findOneAndUpdate').mockReturnValue({
      exec: async () => ({ platformName: 'New Name' }),
    } as ReturnType<typeof PlatformSettingsModel.findOneAndUpdate>);

    const result = await platformSettingsRepository.update({ platformName: 'New Name' });

    expect(updateSpy).toHaveBeenCalledWith(
      {},
      { $set: { platformName: 'New Name' } },
      { new: true },
    );
    expect(result).toEqual({ platformName: 'New Name' });
    findSpy.mockRestore();
    updateSpy.mockRestore();
  });
});
