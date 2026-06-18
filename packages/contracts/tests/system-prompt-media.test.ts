import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../src/prompts/system.js';

describe('composeSystemPrompt — media contract', () => {
  it('keeps image projects on the OD media dispatcher instead of Codex imagegen paths', () => {
    const prompt = composeSystemPrompt({
      agentId: 'codex',
      metadata: {
        kind: 'image',
        imageModel: 'gpt-image-2',
        imageAspect: '1:1',
      },
    });

    expect(prompt).toContain('## Media generation contract');
    expect(prompt).toContain('"$OD_NODE_BIN" "$OD_BIN" media generate');
    expect(prompt).toContain('system `imagegen` skill');
    expect(prompt).toContain('built-in `image_gen` tool');
    expect(prompt).toContain('`generated_images` fallback workflow');
  });
});
