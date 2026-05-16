import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  gradient?: boolean;
}

export const Card = ({ children, className = '', gradient = false }: CardProps) => {
  return (
    <div className={`
      rounded-3xl shadow-xl overflow-hidden
      ${gradient ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white' : 'bg-white text-slate-900 border border-slate-100'}
      ${className}
    `}>
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-6 border-b border-slate-100/10 ${className}`}>{children}</div>
);

export const CardBody = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);
