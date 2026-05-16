import React from 'react';
import { motion } from 'framer-motion';

interface AvatarTierProps {
  tier: number;
  className?: string;
}

export const AvatarTier = ({ tier, className = '' }: AvatarTierProps) => {
  const getTierContent = () => {
    switch (tier) {
      case 1: // 0-99: Simple meditating figure
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full text-slate-400">
            <motion.circle cx="50" cy="35" r="15" fill="currentColor" />
            <motion.path d="M50 55 C30 55, 20 85, 20 90 L80 90 C80 85, 70 55, 50 55" fill="currentColor" />
          </svg>
        );
      case 2: // 100-299: Meditating with amber glow
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full text-amber-500">
            <defs>
              <filter id="glow2" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <motion.g filter="url(#glow2)" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 3, repeat: Infinity }}>
              <circle cx="50" cy="35" r="15" fill="currentColor" />
              <path d="M50 55 C30 55, 20 85, 20 90 L80 90 C80 85, 70 55, 50 55" fill="currentColor" />
            </motion.g>
          </svg>
        );
      case 3: // 300-499: Yogi with saffron halo
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full text-orange-500">
            <defs>
              <filter id="glow3" stdDeviation="5" />
            </defs>
            <motion.circle cx="50" cy="35" r="22" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} />
            <motion.g filter="url(#glow3)" animate={{ scale: [0.98, 1.02, 0.98] }} transition={{ duration: 2, repeat: Infinity }}>
              <circle cx="50" cy="35" r="16" fill="currentColor" />
              <path d="M50 55 C30 55, 20 85, 20 90 L80 90 C80 85, 70 55, 50 55" fill="currentColor" />
            </motion.g>
          </svg>
        );
      case 4: // 500-749: Standing with flowing robes
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full text-yellow-500">
            <motion.g animate={{ y: [0, -5, 0] }} transition={{ duration: 4, repeat: Infinity }}>
              <circle cx="50" cy="25" r="12" fill="currentColor" />
              <path d="M50 40 L30 80 L70 80 Z" fill="currentColor" />
              <motion.path 
                d="M30 45 Q20 60 30 80 M70 45 Q80 60 70 80" 
                stroke="currentColor" 
                strokeWidth="4" 
                fill="none" 
                strokeLinecap="round"
                animate={{ strokeDashoffset: [0, 20, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.g>
          </svg>
        );
      case 5: // 750-999: Divine warrior with cosmic glow
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full text-indigo-400">
            <defs>
              <radialGradient id="cosmic">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4338ca" />
              </radialGradient>
            </defs>
            <motion.circle cx="50" cy="50" r="45" fill="url(#cosmic)" opacity="0.2" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 5, repeat: Infinity }} />
            <motion.g animate={{ x: [0, 2, -2, 0] }} transition={{ duration: 0.2, repeat: Infinity }}>
              <circle cx="50" cy="25" r="14" fill="currentColor" />
              <path d="M50 40 L20 60 L30 90 L70 90 L80 60 Z" fill="currentColor" />
              <circle cx="50" cy="55" r="5" fill="white" />
            </motion.g>
          </svg>
        );
      case 6: // 1000+: Superhero Yogi with shimmer
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24">
                  <animate attributeName="offset" values="-1; 2" dur="2s" repeatCount="indefinite" />
                </stop>
                <stop offset="50%" stopColor="#fffbeb">
                  <animate attributeName="offset" values="-0.5; 2.5" dur="2s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="#fbbf24">
                  <animate attributeName="offset" values="0; 3" dur="2s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
            </defs>
            <motion.path 
              d="M50 5 L90 50 L50 95 L10 50 Z" 
              fill="url(#shimmer)" 
              animate={{ rotate: [0, 5, -5, 0] }} 
              transition={{ duration: 4, repeat: Infinity }}
            />
            <circle cx="50" cy="35" r="15" fill="#1e1b4b" />
            <path d="M50 55 C30 55, 20 85, 20 90 L80 90 C80 85, 70 55, 50 55" fill="#1e1b4b" />
            <motion.path d="M40 20 L50 10 L60 20" stroke="#fbbf24" strokeWidth="4" fill="none" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`relative ${className}`}>
      {getTierContent()}
    </div>
  );
};
