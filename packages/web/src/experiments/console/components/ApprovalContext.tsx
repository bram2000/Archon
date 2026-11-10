import { useMemo, type ReactElement } from 'react';
import { Link } from 'react-router';
import { useEntity } from '../store/cache';
import { K } from '../store/keys';
import * as skill from '../skills';
import { isSystemCategory, type Message } from '../primitives/message';
import { runDetailPath, runMessageConversationId, type Run } from '../primitives/run';

interface ApprovalContextProps {
  run: Run;
}

/**
 * Supporting context comes from conversation messages, never workflow events.
 * Share the run page's caches and conversation selection, including CLI runs
 * and chat-dispatched worker conversations. The gate message owns the request;
 * the latest agent message is optional context, not necessarily a question.
 */
export function ApprovalContext({ run }: ApprovalContextProps): ReactElement | null {
  const isDemo = run.id.startsWith('demo-');

  const { data } = useEntity<Awaited<ReturnType<typeof skill.getRun>> | null>(K.run(run.id), () =>
    isDemo ? Promise.resolve(null) : skill.getRun(run.id)
  );
  const conversationId = isDemo ? null : runMessageConversationId(data?.run ?? run);
  const { data: messages } = useEntity<Message[]>(
    conversationId !== null ? K.messages(conversationId) : 'noop:no-conversation-id',
    () => (conversationId !== null ? skill.listMessages(conversationId) : Promise.resolve([]))
  );

  const lastText = useMemo(() => {
    if (isDemo) return synthFor(run);
    const started = new Date(run.startedAt).getTime();
    for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
      const message = messages?.[i];
      if (
        message?.role === 'assistant' &&
        !isSystemCategory(message.category) &&
        new Date(message.timestamp).getTime() >= started &&
        message.content.trim().length > 0
      ) {
        return message.content.trim();
      }
    }
    return null;
  }, [isDemo, messages, run]);

  if (lastText === null) return null;

  return (
    <details
      key={JSON.stringify([run.id, run.approval?.nodeId, run.approval?.pauseId])}
      className="mt-2 rounded border border-border bg-surface-inset/60 p-3"
      onClick={e => {
        e.stopPropagation();
      }}
      onKeyDown={e => {
        e.stopPropagation();
      }}
    >
      <summary className="cursor-pointer text-[12px] text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-accent">
        Latest agent message
      </summary>
      <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary [overflow-wrap:anywhere]">
        {lastText}
      </div>
      {!isDemo ? (
        <Link
          to={runDetailPath(run)}
          className="mt-2 inline-block text-[11px] text-text-tertiary transition-colors hover:text-text-primary"
        >
          Open full run →
        </Link>
      ) : null}
    </details>
  );
}

function synthFor(run: Run): string {
  if (run.workflow.includes('prd') || run.workflow === 'plan') {
    return [
      '## Foundation Questions',
      '',
      "Here's what I understand so far — now please answer these so I can shape the research phase:",
      '',
      '1. **Who** has this problem? Be specific — not just "users" but what type of person/role?',
      '2. **What** problem are they facing? Describe the observable pain, not the assumed need.',
      "3. **Why** can't they solve it today? What alternatives exist and why do they fail?",
      '4. **Why now?** What changed that makes this worth building?',
      '5. **How** will you know if you solved it? What would success look like?',
    ].join('\n');
  }
  if (run.workflow === 'review') {
    return [
      "I've walked the diff end-to-end against the plan. Overall the implementation tracks.",
      '',
      'Before I open the PR I need your sign-off on two things:',
      '',
      '- The `listWorktrees` selector joins on `working_path` (brittle until the backend exposes `bound_run_id`) — OK to ship as-is and revisit, or block on the backend change?',
      '- Tests cover the happy path but not the stale-env cleanup branch — should I add coverage before PR, or file a follow-up issue?',
    ].join('\n');
  }
  return (
    run.approval?.message ??
    'The agent is waiting for your input. Open the full run to see the conversation.'
  );
}
