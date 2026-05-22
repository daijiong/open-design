// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewProjectPanel } from '../../src/components/NewProjectPanel';
import type { PromptTemplateSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchPromptTemplate: vi.fn(async () => ({ prompt: 'Template body' })),
}));

describe('NewProjectPanel media provider badges', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('treats daemon-restored apiKeyConfigured providers as configured', () => {
    render(
      <NewProjectPanel
        skills={[]}
        designSystems={[]}
        defaultDesignSystemId={null}
        templates={[]}
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={vi.fn()}
        mediaProviders={{
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: '',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    // Model picker is now a combobox — open the popover so the
    // provider group + status badge become visible in the DOM.
    fireEvent.click(screen.getByTestId('model-picker-trigger'));

    const openaiGroup = screen.getByText('OpenAI').closest('.ds-picker-group');
    expect(openaiGroup?.textContent).toContain('Configured');
    expect(openaiGroup?.textContent).not.toContain('Integrated');
  });

  it('locks new image projects to gpt-image-2', () => {
    const onCreate = vi.fn();
    render(
      <NewProjectPanel
        skills={[]}
        designSystems={[]}
        defaultDesignSystemId={null}
        templates={[]}
        onDeleteTemplate={vi.fn()}
        promptTemplates={[]}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Image' }));
    fireEvent.click(screen.getByTestId('model-picker-trigger'));

    expect(screen.getByTestId('model-picker-option-gpt-image-2')).toBeTruthy();
    expect(
      screen.queryByTestId('model-picker-option-gemini-3.1-flash-image-preview'),
    ).toBeNull();

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Fixed image model' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Fixed image model',
        metadata: expect.objectContaining({
          kind: 'image',
          imageModel: 'gpt-image-2',
        }),
      }),
    );
  });

  it('keeps image prompt templates from switching the fixed model', async () => {
    const onCreate = vi.fn();
    const promptTemplates: PromptTemplateSummary[] = [
      {
        id: 'nano-template',
        surface: 'image',
        title: 'Nano template',
        summary: 'A Nano Banana oriented image template',
        category: 'poster',
        tags: [],
        model: 'gemini-3.1-flash-image-preview',
        aspect: '9:16',
        source: { repo: 'fixtures', license: 'MIT' },
      },
    ];
    render(
      <NewProjectPanel
        skills={[]}
        designSystems={[]}
        defaultDesignSystemId={null}
        templates={[]}
        onDeleteTemplate={vi.fn()}
        promptTemplates={promptTemplates}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Media' }));
    fireEvent.click(screen.getByTestId('prompt-template-trigger'));
    fireEvent.click(screen.getByRole('option', { name: /Nano template/i }));
    await waitFor(() =>
      expect(screen.getByTestId('prompt-template-body')).toBeTruthy(),
    );

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Template fixed image model' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Template fixed image model',
        metadata: expect.objectContaining({
          kind: 'image',
          imageModel: 'gpt-image-2',
          promptTemplate: expect.objectContaining({
            model: 'gpt-image-2',
          }),
        }),
      }),
    );
  });
});
