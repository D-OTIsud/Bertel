import {
  buildActorChannelPayload,
  buildCrmActorPayload,
  buildCrmInteractionPayload,
  buildCrmTaskPayload,
} from './crm-payloads';
import type {
  SaveActorChannelInput,
  SaveCrmActorInput,
  SaveCrmInteractionInput,
  SaveCrmTaskInput,
} from './crm';

interface PayloadCase {
  name: string;
  build: (input: Record<string, unknown>) => Record<string, unknown>;
  fields: Array<[string, string]>;
}

const cases: PayloadCase[] = [
  {
    name: 'task',
    build: (input) => buildCrmTaskPayload(input as SaveCrmTaskInput),
    fields: [
      ['id', 'id'], ['objectId', 'object_id'], ['actorId', 'actor_id'], ['title', 'title'],
      ['description', 'description'], ['status', 'status'], ['priority', 'priority'],
      ['dueAt', 'due_at'], ['assigneeIds', 'assignee_ids'], ['owner', 'owner'],
      ['relatedInteractionId', 'related_interaction_id'],
    ],
  },
  {
    name: 'interaction',
    build: (input) => buildCrmInteractionPayload(input as SaveCrmInteractionInput),
    fields: [
      ['id', 'id'], ['objectId', 'object_id'], ['interactionType', 'interaction_type'],
      ['direction', 'direction'], ['status', 'status'], ['subject', 'subject'], ['body', 'body'],
      ['occurredAt', 'occurred_at'], ['topicCode', 'topic_code'], ['sentimentCode', 'sentiment_code'],
      ['actorId', 'actor_id'], ['parentInteractionId', 'parent_interaction_id'],
    ],
  },
  {
    name: 'actor',
    build: (input) => buildCrmActorPayload(input as SaveCrmActorInput),
    fields: [
      ['id', 'id'], ['displayName', 'display_name'], ['gender', 'gender'],
      ['firstName', 'first_name'], ['lastName', 'last_name'], ['objectId', 'object_id'],
      ['roleCode', 'role_code'], ['photoUrl', 'photo_url'],
    ],
  },
  {
    name: 'channel',
    build: (input) => buildActorChannelPayload(input as SaveActorChannelInput),
    fields: [
      ['id', 'id'], ['actorId', 'actor_id'], ['kindCode', 'kind_code'], ['value', 'value'],
      ['isPrimary', 'is_primary'], ['isPublic', 'is_public'],
    ],
  },
];

describe.each(cases)('$name payload partial-update contract', ({ build, fields }) => {
  it('omits both absent fields and fields explicitly set to undefined', () => {
    expect(build({})).toEqual({});
    expect(build(Object.fromEntries(fields.map(([key]) => [key, undefined])))).toEqual({});
  });

  it.each([null, false, 0, ''])('preserves a supplied %p without defaulting or coercion', (value) => {
    const input = Object.fromEntries(fields.map(([key]) => [key, value]));
    const payload = build(input);
    expect(Object.keys(payload)).toEqual(fields.map(([, key]) => key));
    for (const [, key] of fields) expect(payload[key]).toBe(value);
  });

  it('keeps contract key order even when input keys arrive in reverse order', () => {
    const input = Object.fromEntries([...fields].reverse().map(([key]) => [key, key]));
    expect(Object.keys(build(input))).toEqual(fields.map(([, key]) => key));
    expect(JSON.stringify(build(input))).toBe(
      JSON.stringify(Object.fromEntries(fields.map(([source, target]) => [target, source]))),
    );
  });

  it('retains accessor read order, including the second read when a field is present', () => {
    const reads: string[] = [];
    const input: Record<string, unknown> = {};
    const expectedReads: string[] = [];
    const expected: Record<string, unknown> = {};
    fields.forEach(([source, target], index) => {
      let count = 0;
      Object.defineProperty(input, source, {
        get() {
          reads.push(source);
          count += 1;
          return index % 3 === 0 ? undefined : `${source}:${count}`;
        },
      });
      expectedReads.push(source);
      if (index % 3 !== 0) {
        expectedReads.push(source);
        expected[target] = `${source}:2`;
      }
    });

    expect(build(input)).toEqual(expected);
    expect(reads).toEqual(expectedReads);
  });
});

it('passes assignment arrays by reference, including an explicitly empty assignment set', () => {
  const assigned = ['user-1', 'user-2'];
  const empty: string[] = [];
  expect(buildCrmTaskPayload({ assigneeIds: assigned }).assignee_ids).toBe(assigned);
  expect(buildCrmTaskPayload({ assigneeIds: empty }).assignee_ids).toBe(empty);
});
