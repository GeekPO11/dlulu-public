export type DemoChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  showAtFrame: number;
  actionChip?: string;
};

export const CHAT_SEQUENCE: DemoChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: "Add 'Post on Product Hunt' as a task.",
    showAtFrame: 90,
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'Added to Launch phase. Want me to schedule it this week?',
    showAtFrame: 150,
    actionChip: 'add task',
  },
];

