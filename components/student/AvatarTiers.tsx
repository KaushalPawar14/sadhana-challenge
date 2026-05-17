import React from 'react';
import { motion, useSpring, useMotionValue, useTransform } from 'framer-motion';

interface AvatarTierProps {
  tier: number;
  className?: string;
}

export const AvatarTier = ({ tier, className = '' }: AvatarTierProps) => {
  const images: Record<number, string> = {
    1: '/levels/noob.png',
    2: '/levels/survivor.png',
    3: '/levels/hustler.png',
    4: '/levels/champion.png',
    5: '/levels/legend.png',
    6: '/levels/superhuman.png'
  };

  // Ultra-responsive spring physics for a liquid-smooth 3D parallax tilt
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const rotateX = useSpring(useTransform(y, [-120, 120], [15, -15]), { damping: 25, stiffness: 220 });
  const rotateY = useSpring(useTransform(x, [-120, 120], [-15, 15]), { damping: 25, stiffness: 220 });

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left - width / 2;
    const mouseY = event.clientY - rect.top - height / 2;
    x.set(mouseX);
    y.set(mouseY);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  const getTierGlow = () => {
    switch (tier) {
      case 1:
        return 'from-slate-400/20 to-slate-500/20';
      case 2:
        return 'from-teal-400/30 to-emerald-500/30';
      case 3:
        return 'from-orange-400/40 to-red-500/40';
      case 4:
        return 'from-blue-500/40 to-indigo-600/40';
      case 5:
        return 'from-purple-500/50 via-pink-500/50 to-indigo-500/50';
      case 6:
        return 'from-amber-400/60 via-yellow-500/60 to-orange-500/60';
      default:
        return 'from-slate-400/20 to-slate-500/20';
    }
  };

  const imageUrl = images[tier] || '/levels/noob.png';

  return (
    <div 
      className={`relative w-full h-full flex items-center justify-center ${className}`}
      style={{ perspective: 1200 }}
    >
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="w-full h-full flex items-center justify-center relative cursor-pointer group"
      >
        {/* Dynamic Glow Halo directly behind the floating transparent PNG */}
        <div 
          className={`
            absolute w-[85%] h-[85%] rounded-full blur-3xl opacity-30 group-hover:opacity-75 transition-opacity duration-500 bg-gradient-to-tr
            ${getTierGlow()}
          `}
          style={{ transform: 'translateZ(-40px)' }}
        />

        {/* Special Legendary Cosmic Rotating Rings exclusively for Level 6 Superhuman */}
        {tier === 6 && (
          <>
            {/* Outer Golden Flare Ring */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              className="absolute w-[115%] h-[115%] rounded-full border-2 border-dashed border-amber-400/30 opacity-70 blur-[1px]"
              style={{ transform: 'translateZ(-20px)' }}
            />
            {/* Inner Shimmering Solar Ring */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
              className="absolute w-[100%] h-[100%] rounded-full border border-double border-yellow-400/40 opacity-80 blur-[2px]"
              style={{ transform: 'translateZ(-10px)' }}
            />
            {/* Glowing Golden Core */}
            <div 
              className="absolute w-[90%] h-[90%] rounded-full bg-amber-400/10 blur-2xl animate-pulse"
              style={{ transform: 'translateZ(-30px)' }}
            />
          </>
        )}

        {/* Level 5 (Legend) Ambient Purple/Pink Flare Ring */}
        {tier === 5 && (
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute w-[110%] h-[110%] rounded-full border border-dashed border-purple-400/30 opacity-60 blur-[1px]"
            style={{ transform: 'translateZ(-15px)' }}
          />
        )}

        {/* Floating Level Image with 3D Parallax Depth */}
        <motion.img 
          src={imageUrl} 
          alt="Sadhana Level Rank" 
          className="w-full h-full object-contain relative z-10"
          style={{ 
            transform: 'translateZ(60px)',
            filter: 'drop-shadow(0 25px 35px rgba(0,0,0,0.18))'
          }}
        />
      </motion.div>
    </div>
  );
};
