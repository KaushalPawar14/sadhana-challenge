'use client';

import React from 'react';
import { DotLottiePlayer } from '@dotlottie/react-player';

export const MahayogiCrown = () => (
  <DotLottiePlayer
    autoplay
    loop
    src="/animations/mahayogi_crown.lottie"
    style={{ height: '100%', width: '100%' }}
  />
);

export const UnbrokenFlame = () => (
  <DotLottiePlayer
    autoplay
    loop
    src="/animations/unbroken_flame.lottie"
    style={{ height: '100%', width: '100%' }}
  />
);

export const JijnasuScholar = () => (
  <DotLottiePlayer
    autoplay
    loop
    src="/animations/jijnasu_scholar.json"
    style={{ height: '100%', width: '100%' }}
  />
);

export const BrahmaMuhurta = () => (
  <DotLottiePlayer
    autoplay
    loop
    src="/animations/active_entity.lottie"
    style={{ height: '100%', width: '100%' }}
  />
);

export const RisingSadhaka = () => (
  <DotLottiePlayer
    autoplay
    loop
    src="/animations/rising_sadhaka.lottie"
    style={{ height: '100%', width: '100%' }}
  />
);

export const FloatingLotus = () => (
  <DotLottiePlayer
    autoplay
    loop
    src="/animations/active_entity.lottie"
    style={{ height: '100%', width: '100%' }}
  />
);

const ICONS: Record<string, React.ComponentType> = {
  mahayogi_crown: MahayogiCrown,
  unbroken_flame: UnbrokenFlame,
  jijnasu_scholar: JijnasuScholar,
  brahma_muhurta: BrahmaMuhurta,
  rising_sadhaka: RisingSadhaka,
};

/** Award artwork: a custom image when the HOD set one, otherwise the Lottie animation for the icon key. */
export const AwardIcon = ({ iconKey, imageUrl }: { iconKey?: string | null; imageUrl?: string | null }) => {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className="w-full h-full object-contain" />;
  }
  const Cmp = (iconKey && ICONS[iconKey]) || FloatingLotus;
  return <Cmp />;
};
