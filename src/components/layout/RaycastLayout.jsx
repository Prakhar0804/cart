import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export const RaycastLayout = ({ children }) => {
  const contentRef = useRef(null);

  useEffect(() => {
    gsap.fromTo(contentRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
    );
  }, []);

  return (
    <div className="min-h-screen bg-raycast-dark text-raycast-text-primary">
      <div className="max-w-7xl mx-auto p-6">
        <div ref={contentRef} className="opacity-0">
          {children}
        </div>
      </div>
    </div>
  );
};
