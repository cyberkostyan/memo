import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart3,
  Microscope,
  Link2,
  TrendingUp,
  FlaskConical,
  Lightbulb,
} from "lucide-react";

const STEPS: { icon: ReactNode; text: string }[] = [
  { icon: <BarChart3 className="w-7 h-7 text-indigo-400" />, text: "Reading your entries..." },
  { icon: <Microscope className="w-7 h-7 text-violet-400" />, text: "Analyzing patterns..." },
  { icon: <Link2 className="w-7 h-7 text-sky-400" />, text: "Finding correlations..." },
  { icon: <TrendingUp className="w-7 h-7 text-emerald-400" />, text: "Detecting trends..." },
  { icon: <FlaskConical className="w-7 h-7 text-amber-400" />, text: "Processing lab results..." },
  { icon: <Lightbulb className="w-7 h-7 text-yellow-300" />, text: "Generating insights..." },
];

export function AnalysisLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center py-16">
      {/* Animated rings */}
      <div className="relative w-32 h-32 mb-8">
        {/* Outer ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-indigo-500/20"
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Middle ring */}
        <motion.div
          className="absolute inset-3 rounded-full border-2 border-indigo-400/25"
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        />
        {/* Inner ring — spinning dashes */}
        <motion.div
          className="absolute inset-6 rounded-full"
          style={{
            border: "2px dashed rgba(129,140,248,0.3)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />

        {/* Orbiting dots */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-indigo-400"
            style={{
              top: "50%",
              left: "50%",
              marginTop: -4,
              marginLeft: -4,
              filter: "blur(0.5px)",
            }}
            animate={{
              x: [
                Math.cos((i * 2 * Math.PI) / 3) * 48,
                Math.cos((i * 2 * Math.PI) / 3 + Math.PI) * 48,
                Math.cos((i * 2 * Math.PI) / 3 + 2 * Math.PI) * 48,
              ],
              y: [
                Math.sin((i * 2 * Math.PI) / 3) * 48,
                Math.sin((i * 2 * Math.PI) / 3 + Math.PI) * 48,
                Math.sin((i * 2 * Math.PI) / 3 + 2 * Math.PI) * 48,
              ],
              opacity: [0.6, 1, 0.6],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.4,
            }}
          />
        ))}

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
              transition={{ duration: 0.3 }}
            >
              {STEPS[step].icon}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Glow */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Status text */}
      <AnimatePresence mode="wait">
        <motion.p
          key={step}
          className="text-sm text-slate-300 font-medium"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {STEPS[step].text}
        </motion.p>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="flex gap-1.5 mt-4">
        {STEPS.map((_, i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            animate={{
              backgroundColor: i <= step ? "rgb(129,140,248)" : "rgb(51,65,85)",
              scale: i === step ? 1.3 : 1,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      <p className="text-[11px] text-slate-600 mt-6">
        This may take up to a minute
      </p>
    </div>
  );
}
