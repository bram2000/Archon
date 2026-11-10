import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { toRun, type Run } from '../primitives/run';
import { ApprovalPanel } from './ApprovalPanel';

function pausedRun(pauseId?: string, message = 'Review the plan'): Run {
  return toRun({
    id: 'review-run',
    workflow_name: 'review',
    codebase_id: null,
    status: 'paused',
    started_at: '2026-10-05T10:00:00Z',
    metadata: {
      approval: {
        nodeId: 'review-gate',
        pauseId,
        message,
        decisions: [{ id: 'approve' }, { id: 'revise', label: 'Revise plan' }, { id: 'escalate' }],
        decisionsAuthored: true,
      },
    },
  });
}

describe('ApprovalPanel', () => {
  test('keeps the API pause identity and remounts the form when the same node re-pauses', () => {
    const before = pausedRun('pause-before');
    const after = pausedRun('pause-after');
    expect(before.approval?.pauseId).toBe('pause-before');
    expect(after.approval?.pauseId).toBe('pause-after');
    const firstPanel = ApprovalPanel({ run: before });
    expect(ApprovalPanel({ run: before }).key).toBe(firstPanel.key);
    expect(ApprovalPanel({ run: after }).key).not.toBe(firstPanel.key);
    expect(ApprovalPanel({ run: pausedRun() }).key).not.toBe(firstPanel.key);
    expect(ApprovalPanel({ run: { ...before, id: 'other-run' } }).key).not.toBe(firstPanel.key);
  });

  test('renders the declared decisions from the API snapshot', () => {
    const html = renderToStaticMarkup(<ApprovalPanel run={pausedRun('pause-before')} />);
    expect(html).toContain('Continue');
    expect(html).toContain('Revise plan');
    expect(html).toContain('Escalate');
    expect(html).not.toContain('Reject');
  });

  test('shows a short request directly without an empty disclosure', () => {
    const html = renderToStaticMarkup(<ApprovalPanel run={pausedRun()} />);
    expect(html).toContain('Review the plan');
    expect(html).not.toContain('<details');
  });

  test.each(['\n\n', '\r\n\r\n'])(
    'keeps the opening question visible and all supporting paragraphs collapsed (%j)',
    separator => {
      const evidence = 'Checks passed.\nFailed: observations/failed.json\n\nReview the full diff.';
      const html = renderToStaticMarkup(
        <ApprovalPanel
          run={pausedRun('pause', `Approve the test correction?${separator}${evidence}`)}
        />
      );
      const [visible, details] = html.split('<details');
      expect(visible).toContain('Approve the test correction?');
      expect(visible).not.toContain('Checks passed');
      expect(details).toContain('Supporting evidence');
      expect(details).toContain(evidence);
      expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    }
  );

  test('preserves a legacy wall of text in full behind a concise approval question', () => {
    const report = 'Review every assertion against the retained evidence. '.repeat(50);
    const html = renderToStaticMarkup(<ApprovalPanel run={pausedRun('pause', report)} />);
    const [visible, details] = html.split('<details');
    expect(visible).toContain('Approve this step and continue?');
    expect(visible).not.toContain('Review every assertion');
    expect(details).toContain(report.trim());
    expect(html).toContain('data-keymap-approve');
  });

  test('uses the authored approval label while preserving interactive-loop completion', () => {
    const run = pausedRun();
    if (!run.approval) throw new Error('Expected approval');
    run.approval.decisions[0] = { id: 'approve', label: 'Approve after reviewing evidence' };
    const html = renderToStaticMarkup(<ApprovalPanel run={run} />);
    expect(html).toContain('Approve after reviewing evidence');
    expect(html).not.toContain('Continue');
    run.approval.completionSignaled = true;
    expect(renderToStaticMarkup(<ApprovalPanel run={run} />)).toContain('Accept &amp; complete');
  });
});
