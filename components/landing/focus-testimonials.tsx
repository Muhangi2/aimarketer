"use client";

import React, { useState, useRef, useCallback, memo } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Testimonial {
  id: number;
  author: string;
  role: string;
  company: string;
  avatar: string;
  quote: string;
}

// PLACEHOLDER quotes and people for the draft. Swap in real customer quotes before launch
const avatar = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=120&h=120&auto=format&fit=crop&crop=faces&q=80`;

const INITIAL_TESTIMONIALS: Testimonial[] = [
  {
    id: 0,
    author: "Amara N.",
    role: "Founder",
    company: "Kiko Skincare",
    avatar: avatar("1531123897727-8f129e1688ce"),
    quote: "The Research Agent spots trends before my feed does, and the Creator Agent actually sounds like us.",
  },
  {
    id: 1,
    author: "Daniel K.",
    role: "Head of Growth",
    company: "Brewline Coffee",
    avatar: avatar("1507591064344-4c6ce005b128"),
    quote: "We went from posting twice a week to every day across TikTok, Instagram, LinkedIn and X without hiring.",
  },
  {
    id: 2,
    author: "Sofia R.",
    role: "Social Lead",
    company: "Northpeak Outdoors",
    avatar: avatar("1494790108377-be9c29b29330"),
    quote: "Watching the agents work in the office view is oddly addictive, and I always know what each one is doing.",
  },
  {
    id: 3,
    author: "Brian O.",
    role: "Agency Owner",
    company: "Loudframe Studio",
    avatar: avatar("1472099645785-5658abf4ff4e"),
    quote: "One inbox for every client's comments and DMs saved my team hours every single week.",
  },
];

const ADDITIONAL_TESTIMONIALS: Testimonial[] = [
  {
    id: 4,
    author: "Grace M.",
    role: "Marketing Manager",
    company: "Tilly Bakes",
    avatar: avatar("1487412720507-e7ab37603c6f"),
    quote: "The Scheduler Agent picks posting times I would never have guessed, and our reach doubled.",
  },
  {
    id: 5,
    author: "Kevin T.",
    role: "Content Creator",
    company: "@kevbuilds",
    avatar: avatar("1463453091185-61582044d556"),
    quote: "I review drafts over coffee and approve them in one click. The rest just happens.",
  },
  {
    id: 6,
    author: "Lena W.",
    role: "Brand Director",
    company: "Atelier Nine",
    avatar: avatar("1438761681033-6461ffad8d80"),
    quote: "The Analytics Agent turns numbers into a short to-do list instead of another dashboard to stare at.",
  },
  {
    id: 7,
    author: "Ravi P.",
    role: "Co-founder",
    company: "Fitloop",
    avatar: avatar("1545167622-3a6ac756afa4"),
    quote: "Setting up a full campaign took ten minutes. It felt like onboarding a whole marketing team at once.",
  },
];

const ALL_ITEMS = [...INITIAL_TESTIMONIALS, ...ADDITIONAL_TESTIMONIALS];

const TestimonialSpanItem = memo(function TestimonialSpanItem({
  item,
  isHovered,
  hasHover,
  onHover,
}: {
  item: Testimonial;
  isHovered: boolean;
  hasHover: boolean;
  onHover: (id: number) => void;
}) {
  const stateClass = !hasHover
    ? "opacity-100 blur-0 text-slate-700"
    : isHovered
    ? "opacity-100 blur-0 text-foreground"
    : "opacity-30 blur-[2.8px] text-muted-foreground";

  const avatarClass = !hasHover
    ? "grayscale-[25%] opacity-90 scale-100"
    : isHovered
    ? "grayscale-0 opacity-100 scale-110 shadow-none"
    : "grayscale-[70%] blur-[1.2px] opacity-35 scale-95 shadow-none";

  return (
    <span
      onMouseEnter={() => onHover(item.id)}
      className={cn(
        "inline cursor-pointer select-none transition-[opacity,filter,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity,filter,color]",
        stateClass
      )}
    >
      <span
        className={cn(
          "inline-block align-middle mr-2.5 overflow-hidden rounded-full transition-[transform,filter,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,filter,opacity]",
          avatarClass
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.avatar}
          alt={item.author}
          width={44}
          height={44}
          loading="eager"
          className="inline-block w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full object-cover align-middle border-0 outline-none shadow-none ring-0 scale-110"
        />
      </span>
      {item.quote}
      <span className="relative inline-block w-0 h-0 align-baseline" />{" "}
    </span>
  );
});

export function FocusTestimonials() {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const rawMouseX = useMotionValue(0);
  const rawMouseY = useMotionValue(0);

  const springConfig = { damping: 30, stiffness: 320, mass: 0.45 };
  const smoothX = useSpring(rawMouseX, springConfig);
  const smoothY = useSpring(rawMouseY, springConfig);

  const activeItem =
    hoveredId !== null ? ALL_ITEMS.find((t) => t.id === hoveredId) : null;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      rawMouseX.set(e.clientX - rect.left);
      rawMouseY.set(e.clientY - rect.top);
    },
    [rawMouseX, rawMouseY]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  const handleHover = useCallback((id: number) => {
    setHoveredId(id);
  }, []);

  const handleToggleShowMore = () => {
    setShowMore((prev) => {
      const nextState = !prev;
      if (
        !nextState &&
        hoveredId !== null &&
        hoveredId >= INITIAL_TESTIMONIALS.length
      ) {
        setHoveredId(null);
      }
      return nextState;
    });
  };

  const hasHover = hoveredId !== null;

  return (
    <div className="relative flex w-full flex-col items-center justify-center bg-transparent select-none">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative z-10 flex w-full max-w-[1400px] flex-col rounded-[32px] border border-black/[0.06] bg-white p-6 text-ink shadow-[0_30px_80px_-40px_rgba(7,11,24,0.25)] transition-all sm:p-10 md:p-16"
      >
        <AnimatePresence>
          {activeItem && (
            <motion.div
              key="author-tooltip"
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.85,
                y: 6,
                transition: { duration: 0.15, ease: "easeOut" },
              }}
              transition={{
                duration: 0.2,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                x: smoothX,
                y: smoothY,
                translateX: 18,
                translateY: -56,
              }}
              className="pointer-events-none absolute left-0 top-0 z-50 flex items-center gap-2.5 rounded-full border border-white/20 bg-neutral-950/90 pl-2 pr-4 py-2 text-white shadow-2xl backdrop-blur-xl will-change-[transform,opacity]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <div className="h-7 w-7 rounded-full overflow-hidden flex-shrink-0">
                <img
                  src={activeItem.avatar}
                  alt={activeItem.author}
                  width={28}
                  height={28}
                  className="h-full w-full object-cover border-0 outline-none shadow-none ring-0 scale-110"
                />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xs sm:text-sm font-semibold tracking-tight text-white whitespace-nowrap">
                  {activeItem.author}
                </span>
                <span className="text-[10px] sm:text-xs font-normal text-slate-300 whitespace-nowrap">
                  {activeItem.role} ·{" "}
                  <span className="font-medium text-white">
                    {activeItem.company}
                  </span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex-1 text-2xl sm:text-3xl md:text-4xl lg:text-[38px] font-medium leading-[148%] tracking-[-0.025em] text-foreground">
          {INITIAL_TESTIMONIALS.map((item) => (
            <TestimonialSpanItem
              key={item.id}
              item={item}
              isHovered={hoveredId === item.id}
              hasHover={hasHover}
              onHover={handleHover}
            />
          ))}

          <span
            className={cn(
              "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              showMore ? "inline opacity-100" : "hidden opacity-0"
            )}
          >
            {ADDITIONAL_TESTIMONIALS.map((item) => (
              <TestimonialSpanItem
                key={item.id}
                item={item}
                isHovered={hoveredId === item.id}
                hasHover={hasHover}
                onHover={handleHover}
              />
            ))}
          </span>
        </div>

        <div className="mt-8 sm:mt-10 flex justify-center">
          <button
            type="button"
            onClick={handleToggleShowMore}
            className="group inline-flex items-center gap-1.5 text-sm tracking-tight text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:underline"
          >
            <span>
              {showMore
                ? "Show less"
                : `Read all testimonials (${ALL_ITEMS.length})`}
            </span>

            <motion.span
              animate={{ rotate: showMore ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 22 }}
              className="inline-flex"
            >
              <ChevronDown className="h-3.5 w-3.5 text-current" />
            </motion.span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default FocusTestimonials;
