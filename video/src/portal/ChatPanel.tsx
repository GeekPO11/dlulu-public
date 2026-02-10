import React from 'react';
import {cn} from '../utils/cn';
import type {DemoChatMessage} from '../data/demoChat';
import {enterUp} from '../motion/primitives';
import {useCurrentFrame, useVideoConfig} from 'remotion';

export const ChatPanel: React.FC<{
  userName?: string;
  messages: DemoChatMessage[];
  showTypingFrom?: number | null;
  showTypingTo?: number | null;
}> = ({userName = 'You', messages, showTypingFrom, showTypingTo}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const isTyping =
    typeof showTypingFrom === 'number' &&
    typeof showTypingTo === 'number' &&
    frame >= showTypingFrom &&
    frame < showTypingTo;

  return (
    <div className="w-full h-full p-8 flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground/70">chat</div>
          <div className="text-2xl font-black text-foreground mt-2">Solulu</div>
        </div>
        <div className="px-4 py-2 rounded-full bg-card/60 border border-border text-muted-foreground text-xs font-black uppercase tracking-widest">
          guarded actions
        </div>
      </div>

      <div className="mt-6 flex-1 rounded-3xl border border-border bg-card/35 overflow-hidden relative">
        <div className="absolute inset-0 p-6 space-y-6">
          {messages.map((m) => {
            const visible = frame >= m.showAtFrame;
            const local = frame - m.showAtFrame;
            const style = enterUp({frame: local, fps, delay: 0, duration: 18});

            if (!visible) return null;
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={cn('flex items-end gap-4 w-full', isUser ? 'justify-end' : 'justify-start')}
                style={{opacity: style.opacity}}
              >
                {!isUser ? (
                  <div className="size-10 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
                    <div className="text-primary font-black">S</div>
                  </div>
                ) : null}

                <div className={cn('max-w-[78%] flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'px-5 py-4 text-base leading-relaxed shadow-lg rounded-2xl',
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-br-none shadow-primary/10'
                        : 'glass-ai text-foreground rounded-bl-none'
                    )}
                  >
                    {m.content}
                  </div>
                  {!isUser && m.actionChip ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-black text-emerald-400 uppercase tracking-wider">
                      <span className="text-emerald-400">●</span>
                      {m.actionChip}
                    </div>
                  ) : null}
                </div>

                {isUser ? (
                  <div className="size-10 rounded-full border border-border bg-brand-gradient text-primary-foreground font-black flex items-center justify-center shrink-0">
                    {userName.slice(0, 1).toUpperCase()}
                  </div>
                ) : null}
              </div>
            );
          })}

          {isTyping ? (
            <div className="flex items-end gap-4 w-full justify-start opacity-80">
              <div className="size-10 rounded-full border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
                <div className="text-primary font-black">S</div>
              </div>
              <div className="glass-ai rounded-2xl rounded-bl-none px-6 py-4 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
