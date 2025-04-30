import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { GlassCard } from './UIComponents';

const StatCard = ({ title, value, subtitle, trend, color = 'white' }) => {
  const valueRef = useRef(null);

  useEffect(() => {
    gsap.from(valueRef.current, {
      textContent: 0,
      duration: 2,
      ease: "power1.out",
      snap: { textContent: 1 },
      stagger: {
        each: 0.2,
        onUpdate: function() {
          this.targets()[0].innerHTML = numberWithCommas(Math.ceil(this.targets()[0].textContent));
        },
      }
    });
  }, [value]);

  const numberWithCommas = (x) => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-medium text-gray-300 mb-2">{title}</h3>
      <p ref={valueRef} className={`text-3xl font-bold text-${color}`}>{value}</p>
      <p className={`text-${color} text-sm mt-2 opacity-80`}>{subtitle}</p>
      {trend && (
        <span className={`text-${trend.color} text-sm ml-2`}>
          {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
        </span>
      )}
    </GlassCard>
  );
};

export default StatCard;
