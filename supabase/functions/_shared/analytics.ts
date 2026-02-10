import { logInfo } from './logger.ts';

interface TrackContext {
  functionName?: string;
  requestId?: string;
  userId?: string;
}

export function track(eventName: string, payload: Record<string, any> = {}, context: TrackContext = {}) {
  const functionName = context.functionName || 'analytics';
  const eventPayload = {
    event: eventName,
    user_id: context.userId,
    request_id: context.requestId,
    ...payload,
  };

  logInfo(functionName, 'analytics_event', eventPayload);
}
