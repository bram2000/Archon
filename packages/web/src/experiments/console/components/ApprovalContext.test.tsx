import { afterEach, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ApprovalContext } from './ApprovalContext';
import { RunStream } from './RunStream';
import { toRun } from '../primitives/run';
import { toRunEvent } from '../primitives/event';
import { toMessage, type Message } from '../primitives/message';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';

const run = toRun({
  id: 'approval-context-test',
  workflow_name: 'review',
  codebase_id: null,
  status: 'paused',
  started_at: '2026-11-10T10:00:00Z',
  conversation_platform_id: 'approval-context-test-cli',
  metadata: { approval: { nodeId: 'review', message: 'Approve the correction?' } },
});

const suspended = toRunEvent({
  id: 'suspended',
  workflow_run_id: run.id,
  step_index: null,
  step_name: 'review',
  event_type: 'node_suspended',
  created_at: '2026-11-10T10:05:00Z',
  data: { node: { id: 'review', kind: 'gate' }, message: 'Internal pause diagnostic' },
});

function message(
  content: string,
  role = 'assistant',
  category?: string,
  created_at = '2026-11-10T10:04:00Z'
): Message {
  return toMessage({
    id: content,
    role,
    content,
    created_at,
    metadata: JSON.stringify({ category }),
  });
}

function render(current = run): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ApprovalContext run={current} />
    </MemoryRouter>
  );
}

afterEach(() => {
  invalidate(K.run(run.id));
  invalidate(K.messages('approval-context-test-cli'));
  invalidate(K.messages('approval-context-test-worker'));
});

test('uses real assistant messages, excluding internal events, framework messages and user text', () => {
  set(K.run(run.id), { run, events: [suspended], nodes: [] });
  set(K.messages('approval-context-test-cli'), [
    message('The correction refreshes the form before submission.'),
    message('Waiting for approval', 'assistant', 'workflow_status'),
    message('System activity', 'system'),
    message('User feedback', 'user'),
    message('  '),
  ]);

  const html = render();
  expect(html).toContain('Latest agent message');
  expect(html).toContain('The correction refreshes the form before submission.');
  expect(html).toContain('href="/console/r/approval-context-test"');
  expect(html).not.toContain('Internal pause diagnostic');
  expect(html).not.toContain('Waiting for approval');
  expect(html).not.toContain('System activity');
  expect(html).not.toContain('User feedback');
  expect(html).not.toContain('What the agent is asking');
  expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
});

test('does not substitute workflow events or an earlier run’s messages when no agent context exists', () => {
  set(K.run(run.id), { run, events: [suspended], nodes: [] });
  set(K.messages('approval-context-test-cli'), [
    message('Previous run question', 'assistant', undefined, '2026-11-10T09:00:00Z'),
    message('Framework notice', 'assistant', 'workflow_status'),
  ]);
  expect(render()).toBe('');
});

test('uses the worker conversation discovered in run detail for a dashboard card', () => {
  const card = { ...run, conversationPlatformId: null, workerPlatformId: null };
  const detail = { ...card, workerPlatformId: 'approval-context-test-worker' };
  set(K.run(run.id), { run: detail, events: [suspended], nodes: [] });
  set(K.messages('approval-context-test-worker'), [message('Worker review findings')]);
  expect(render(card)).toContain('Worker review findings');
});

test('internal events appear in the run stream only when System is enabled', () => {
  const stream = (showSystem: boolean): string =>
    renderToStaticMarkup(
      <RunStream
        messages={[]}
        events={[suspended]}
        nodes={[]}
        providerEvents={new Map()}
        showToolCalls={false}
        showSystem={showSystem}
        selectedNodeId="all"
      />
    );
  expect(stream(false)).not.toContain('Internal pause diagnostic');
  expect(stream(true)).toContain('Internal pause diagnostic');
  expect(stream(true)).toContain('node_suspended');
});
