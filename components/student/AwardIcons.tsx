import React from 'react';
import { motion } from 'framer-motion';

export const MahayogiCrown = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full text-amber-500">
    <motion.path 
      d="M20 80 L30 40 L50 60 L70 40 L80 80 Z" 
      fill="currentColor"
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 2, repeat: Infinity }}
    />
    <circle cx="20" cy="80" r="4" fill="currentColor" />
    <circle cx="50" cy="60" r="4" fill="currentColor" />
    <circle cx="80" cy="80" r="4" fill="currentColor" />
    <circle cx="30" cy="40" r="4" fill="currentColor" />
    <circle cx="70" cy="40" r="4" fill="currentColor" />
  </svg>
);

export const UnbrokenFlame = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full text-orange-600">
    <motion.path 
      d="M50 10 C30 40 20 60 20 80 C20 95 80 95 80 80 C80 60 70 40 50 10" 
      fill="currentColor"
      animate={{ 
        scaleY: [1, 1.1, 1],
        scaleX: [1, 0.9, 1],
        skewX: [0, 5, -5, 0]
      }}
      transition={{ duration: 0.5, repeat: Infinity }}
    />
    <motion.path 
      d="M50 30 C40 50 35 65 35 80 C35 90 65 90 65 80 C65 65 60 50 50 30" 
      fill="white" 
      opacity="0.3"
      animate={{ scale: [0.8, 1, 0.8] }}
      transition={{ duration: 0.3, repeat: Infinity }}
    />
  </svg>
);

export const JijnasuScholar = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full text-teal-500">
    <rect x="20" y="30" width="60" height="40" rx="4" fill="currentColor" />
    <motion.path 
      d="M50 30 L50 70" 
      stroke="white" 
      strokeWidth="2"
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
    <path d="M30 40 H45 M30 50 H45 M30 60 H45" stroke="white" strokeWidth="2" opacity="0.5" />
    <path d="M55 40 H70 M55 50 H70 M55 60 H70" stroke="white" strokeWidth="2" opacity="0.5" />
  </svg>
);

export const BrahmaMuhurta = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full text-amber-300">
    <motion.circle 
      cx="50" cy="80" r="30" 
      fill="currentColor"
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 4, repeat: Infinity }}
    />
    <motion.g animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
        <line 
          key={deg}
          x1="50" y1="20" x2="50" y2="10" 
          stroke="currentColor" 
          strokeWidth="4" 
          strokeLinecap="round"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
    </motion.g>
  </svg>
);

export const RisingSadhaka = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full text-emerald-500">
    <motion.path 
      d="M50 90 L50 50" 
      stroke="currentColor" 
      strokeWidth="4" 
    />
    <motion.path 
      d="M50 70 Q30 50 50 30 Q70 50 50 70" 
      fill="currentColor"
      initial={{ scale: 0 }}
      animate={{ scale: [0, 1.2, 1] }}
      transition={{ duration: 1, repeat: Infinity, repeatDelay: 3 }}
    />
  </svg>
);

export const FloatingLotus = () => (
  <svg viewBox="0 0 100 100" className="w-64 h-64 text-indigo-200">
    <motion.g
      animate={{ 
        y: [0, -20, 0],
        rotate: [0, 5, -5, 0]
      }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    >
      {[0, 72, 144, 216, 288].map(deg => (
        <motion.path 
          key={deg}
          d="M50 50 Q30 20 50 10 Q70 20 50 50" 
          fill="currentColor"
          transform={`rotate(${deg} 50 50)`}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, delay: deg/360 }}
        />
      ))}
      <circle cx="50" cy="50" r="10" fill="currentColor" />
    </motion.g>
  </svg>
);
