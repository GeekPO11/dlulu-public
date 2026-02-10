import React from 'react';
import {cn} from '../utils/cn';

export const PortalSurface: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({className, children}) => {
  return (
    <div className={cn('glass-panel border border-border rounded-3xl dlulu-soft-shadow', className)}>
      {children}
    </div>
  );
};
