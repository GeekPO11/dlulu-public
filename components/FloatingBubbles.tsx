import React, { useState, useEffect, useRef, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

interface BubbleData {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  // CSS animation properties
  xMove: number;
  yMove: number;
  duration: number;
  delay: number;
}

interface FloatingBubblesProps {
  goals: string[];
  selectedGoals: string[];
  onToggle: (goal: string) => void;
  containerClassName?: string;
}

// =============================================================================
// Seeded Random for Consistent Layouts
// =============================================================================

const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

// =============================================================================
// Golden Angle Spiral Layout (Organic Distribution)
// =============================================================================

const goldenAngle = Math.PI * (3 - Math.sqrt(5));

const createBubbleLayout = (
  goals: string[],
  width: number,
  height: number
): BubbleData[] => {
  if (width <= 0 || height <= 0) return [];

  const bubbles: BubbleData[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const baseSize = Math.min(width, height);

  // Size range
  const minSize = baseSize * 0.11;
  const maxSize = baseSize * 0.18;
  const padding = 8;

  // Place bubbles using golden angle spiral
  goals.forEach((goal, i) => {
    // Size variation based on text length and index
    const textFactor = Math.max(0.8, Math.min(1.15, 1.1 - (goal.length - 8) * 0.015));
    const indexVariation = 0.85 + seededRandom(i * 17) * 0.35;
    const size = minSize + (maxSize - minSize) * indexVariation * textFactor;

    // Golden angle spiral for organic placement
    const angle = i * goldenAngle;
    const radius = baseSize * 0.08 * Math.sqrt(i + 0.5);

    let x = centerX + Math.cos(angle) * radius;
    let y = centerY + Math.sin(angle) * radius;

    // Add slight randomness
    x += (seededRandom(i * 7) - 0.5) * baseSize * 0.1;
    y += (seededRandom(i * 11) - 0.5) * baseSize * 0.1;

    // Keep within bounds
    const halfSize = size / 2;
    x = Math.max(halfSize + padding, Math.min(width - halfSize - padding, x));
    y = Math.max(halfSize + padding, Math.min(height - halfSize - padding, y));

    // Random CSS animation parameters for natural movement
    // Random CSS animation parameters for natural movement
    // Soothed: Slower duration, smaller movement range
    const xMove = (seededRandom(i * 13) - 0.5) * 15; // Reduced from 30
    const yMove = (seededRandom(i * 19) - 0.5) * 12; // Reduced from 25
    const duration = 12 + seededRandom(i * 23) * 10; // Increased from 6-14 to 12-22s
    const delay = seededRandom(i * 29) * -duration; // Negative delay for offset start

    bubbles.push({
      id: goal,
      label: goal,
      x,
      y,
      size,
      xMove,
      yMove,
      duration,
      delay,
    });
  });

  // Resolve overlaps with simple repulsion
  for (let iter = 0; iter < 20; iter++) {
    let moved = false;
    bubbles.forEach((a, i) => {
      bubbles.forEach((b, j) => {
        if (i >= j) return;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = (a.size + b.size) / 2 + padding;

        if (dist < minDist && dist > 0.1) {
          moved = true;
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;

          a.x -= nx * overlap * 0.6;
          a.y -= ny * overlap * 0.6;
          b.x += nx * overlap * 0.6;
          b.y += ny * overlap * 0.6;

          // Keep in bounds
          const aHalf = a.size / 2;
          const bHalf = b.size / 2;
          a.x = Math.max(aHalf, Math.min(width - aHalf, a.x));
          a.y = Math.max(aHalf, Math.min(height - aHalf, a.y));
          b.x = Math.max(bHalf, Math.min(width - bHalf, b.x));
          b.y = Math.max(bHalf, Math.min(height - bHalf, b.y));
        }
      });
    });
    if (!moved) break;
  }

  return bubbles;
};

// =============================================================================
// Floating Bubbles Component
// =============================================================================

const FloatingBubbles: React.FC<FloatingBubblesProps> = ({
  goals,
  selectedGoals,
  onToggle,
  containerClassName = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Observe container size
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Calculate bubble layout
  const bubbles = useMemo(() => {
    return createBubbleLayout(goals, dimensions.width, dimensions.height);
  }, [goals, dimensions.width, dimensions.height]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${containerClassName}`}
    >
      {bubbles.map((bubble) => {
        const isSelected = selectedGoals.includes(bubble.id);
        const fontSize = bubble.size < 70 ? 10 : bubble.size < 90 ? 11 : bubble.size < 110 ? 12 : 13;

        return (
          <div
            key={bubble.id}
            className="absolute"
            style={{
              left: `${bubble.x}px`,
              top: `${bubble.y}px`,
              width: `${bubble.size}px`,
              height: `${bubble.size}px`,
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected ? 20 : 10,
              // CSS custom properties for animation
              '--x-move': `${bubble.xMove}px`,
              '--y-move': `${bubble.yMove}px`,
              '--duration': `${bubble.duration}s`,
              '--delay': `${bubble.delay}s`,
            } as React.CSSProperties}
          >
            {/* Floating animation wrapper */}
            <div
              className="w-full h-full bubble-float"
              style={{
                animationDuration: `${bubble.duration}s`,
                animationDelay: `${bubble.delay}s`,
              }}
            >
              {/* Scale/breathe animation wrapper */}
              <div
                className="w-full h-full bubble-breathe"
                style={{
                  animationDuration: `${4 + (bubble.duration % 3)}s`,
                  animationDelay: `${bubble.delay * 0.5}s`,
                }}
              >
                <button
                  onClick={() => onToggle(bubble.id)}
                  className={`
                    w-full h-full
                    flex items-center justify-center
                    rounded-full
                    transition-all duration-300 ease-out
                    font-medium leading-tight text-center
                    cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2
                    ${isSelected
                      ? 'bg-brand-gradient text-primary-foreground border-2 border-primary/60 shadow-xl shadow-primary/40 scale-105'
                      : 'bg-primary/15 text-foreground border border-primary/20 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20 hover:border-primary/40 hover:scale-105 hover:bg-primary/25'
                    }
                  `}
                  style={{
                    fontSize: `${fontSize}px`,
                    padding: '8px',
                  }}
                >
                  <span className="px-1 leading-tight select-none text-current">{bubble.label}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Pure CSS animations for smooth GPU-accelerated movement */}
      <style>{`
        .bubble-float {
          animation: bubbleFloat var(--duration) ease-in-out infinite;
          animation-delay: var(--delay);
          will-change: transform;
        }
        
        .bubble-breathe {
          animation: bubbleBreathe 5s ease-in-out infinite;
          will-change: transform;
        }
        
        @keyframes bubbleFloat {
          0%, 100% {
            transform: translate(0, 0);
          }
          25% {
            transform: translate(var(--x-move), calc(var(--y-move) * 0.5));
          }
          50% {
            transform: translate(calc(var(--x-move) * 0.3), var(--y-move));
          }
          75% {
            transform: translate(calc(var(--x-move) * -0.5), calc(var(--y-move) * 0.3));
          }
        }
        
        @keyframes bubbleBreathe {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.03);
          }
        }
      `}</style>
    </div>
  );
};

export default FloatingBubbles;
