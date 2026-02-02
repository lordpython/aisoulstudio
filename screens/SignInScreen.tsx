/**
 * SignInScreen - Split-screen authentication page for AIsoul Studio
 *
 * Design: "Digital Soul Awakening"
 * Left: Animated neural mesh background with floating particles
 * Right: Refined dark minimalism with elegant typography
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// Generate deterministic positions for neural nodes
function generateNodes(count: number, seed: number) {
  const nodes: Array<{ x: number; y: number; size: number; delay: number }> = [];
  for (let i = 0; i < count; i++) {
    const pseudoRandom = Math.sin(seed + i * 12.9898) * 43758.5453;
    const x = (pseudoRandom % 100 + 100) % 100;
    const y = ((pseudoRandom * 1.3) % 100 + 100) % 100;
    const size = 2 + (pseudoRandom % 4);
    const delay = (i * 0.2) % 3;
    nodes.push({ x, y, size, delay });
  }
  return nodes;
}

// Generate connections between nearby nodes
function generateConnections(nodes: Array<{ x: number; y: number }>) {
  const connections: Array<{ x1: number; y1: number; x2: number; y2: number; delay: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i]!.x - nodes[j]!.x;
      const dy = nodes[i]!.y - nodes[j]!.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 25 && connections.length < 20) {
        connections.push({
          x1: nodes[i]!.x,
          y1: nodes[i]!.y,
          x2: nodes[j]!.x,
          y2: nodes[j]!.y,
          delay: i * 0.1,
        });
      }
    }
  }
  return connections;
}

// Animated Neural Background Component
function NeuralBackground() {
  const nodes = useMemo(() => generateNodes(24, 42), []);
  const connections = useMemo(() => generateConnections(nodes), [nodes]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Deep space gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.08_0.04_280)] via-[oklch(0.05_0.02_240)] to-[oklch(0.03_0.01_200)]" />

      {/* Animated mesh gradient blobs */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, oklch(0.45 0.15 280 / 0.4) 0%, transparent 70%)',
          left: '10%',
          top: '20%',
          filter: 'blur(60px)',
        }}
        animate={{
          x: [0, 50, 0],
          y: [0, -30, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full opacity-25"
        style={{
          background: 'radial-gradient(circle, oklch(0.50 0.18 190 / 0.5) 0%, transparent 70%)',
          right: '5%',
          bottom: '10%',
          filter: 'blur(80px)',
        }}
        animate={{
          x: [0, -40, 0],
          y: [0, 40, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, oklch(0.55 0.20 30 / 0.3) 0%, transparent 70%)',
          left: '50%',
          top: '60%',
          filter: 'blur(70px)',
        }}
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -50, 20, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 5,
        }}
      />

      {/* Neural network connections */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.70 0.15 190 / 0.3)" />
            <stop offset="100%" stopColor="oklch(0.55 0.20 280 / 0.1)" />
          </linearGradient>
        </defs>
        {connections.map((conn, i) => (
          <motion.line
            key={i}
            x1={`${conn.x1}%`}
            y1={`${conn.y1}%`}
            x2={`${conn.x2}%`}
            y2={`${conn.y2}%`}
            stroke="url(#lineGradient)"
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.6, 0.3] }}
            transition={{
              duration: 3,
              delay: conn.delay,
              repeat: Infinity,
              repeatType: 'reverse',
              ease: 'easeInOut',
            }}
          />
        ))}
      </svg>

      {/* Neural nodes */}
      {nodes.map((node, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: node.size,
            height: node.size,
            left: `${node.x}%`,
            top: `${node.y}%`,
            background: i % 3 === 0
              ? 'oklch(0.70 0.15 190)'
              : i % 3 === 1
                ? 'oklch(0.60 0.18 280)'
                : 'oklch(0.65 0.12 30)',
            boxShadow: `0 0 ${node.size * 3}px ${node.size}px oklch(0.70 0.15 190 / 0.3)`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0.4, 0.9, 0.4],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 4 + (i % 3),
            delay: node.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Floating large orbs */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={`orb-${i}`}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 150 + i * 50,
            height: 150 + i * 50,
            left: `${15 + i * 18}%`,
            top: `${10 + i * 15}%`,
            background: `radial-gradient(circle at 30% 30%, oklch(0.70 0.15 ${190 + i * 25} / 0.08) 0%, transparent 60%)`,
          }}
          animate={{
            x: [0, 20 - i * 5, 0],
            y: [0, 15 + i * 3, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 20 + i * 5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}

      {/* Scan line effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, oklch(0.70 0.15 190 / 0.03) 50%, transparent 100%)',
          backgroundSize: '100% 4px',
        }}
        animate={{ y: ['-100%', '100%'] }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,oklch(0.03_0.01_240)_100%)]" />

      {/* Film grain */}
      <div className="absolute inset-0 cinema-grain opacity-20" />

      {/* Right edge fade for seamless transition */}
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[var(--cinema-void)] to-transparent" />
    </div>
  );
}

export default function SignInScreen() {
  const navigate = useNavigate();
  const { user, isLoading, error, signInWithGoogle, clearError, isAuthenticated } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    clearError();
    try {
      await signInWithGoogle();
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleContinueWithoutSignIn = () => {
    navigate('/');
  };

  return (
    <div className="fixed inset-0 flex bg-[var(--cinema-void)]">
      {/* ===== LEFT PANEL: Animated Neural Background ===== */}
      <motion.div
        className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <NeuralBackground />

        {/* Floating brand element */}
        <motion.div
          className="absolute bottom-12 left-12 z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          <p className="text-[var(--cinema-silver)]/40 text-sm tracking-[0.3em] uppercase font-light">
            Where AI Meets Creativity
          </p>
        </motion.div>
      </motion.div>

      {/* ===== RIGHT PANEL: Authentication ===== */}
      <motion.div
        className="w-full lg:w-1/2 xl:w-[45%] flex flex-col items-center justify-center p-8 md:p-12 lg:p-16 relative"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--cinema-celluloid)] via-[var(--cinema-void)] to-[var(--cinema-void)]" />

        {/* Decorative corner accents */}
        <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none">
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_0%,oklch(0.70_0.15_190_/_0.05)_0%,transparent_50%)]" />
        </div>
        <div className="absolute bottom-0 left-0 w-48 h-48 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_100%,oklch(0.55_0.20_280_/_0.03)_0%,transparent_50%)]" />
        </div>

        {/* Content container */}
        <div className="relative z-10 w-full max-w-md space-y-10">

          {/* Brand Section */}
          <motion.div
            className="text-center space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {/* Logo Icon */}
            <motion.div
              className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-[oklch(0.70_0.15_190)] to-[oklch(0.55_0.20_280)] flex items-center justify-center shadow-2xl"
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
              style={{
                boxShadow: '0 20px 60px -10px oklch(0.70 0.15 190 / 0.4)',
              }}
            >
              <Sparkles className="w-10 h-10 text-white" />
            </motion.div>

            {/* Brand Name */}
            <div>
              <h1 className="font-display text-4xl md:text-5xl tracking-tight text-[var(--cinema-silver)]">
                AIsoul{' '}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[oklch(0.70_0.15_190)] to-[oklch(0.65_0.25_30)]">
                  Studio
                </span>
              </h1>
              <p className="mt-3 text-[var(--cinema-silver)]/50 text-base font-light tracking-wide">
                Create. Imagine. Transform.
              </p>
            </div>
          </motion.div>

          {/* Sign-in Section */}
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-[oklch(0.35_0.15_25_/_0.15)] border border-[oklch(0.35_0.15_25_/_0.3)] text-[oklch(0.75_0.12_25)]"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="text-sm">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Google Sign-in Button */}
            <motion.button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn || isLoading}
              className={cn(
                "group w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl",
                "bg-white hover:bg-gray-50 text-gray-800 font-medium",
                "transition-all duration-300 ease-out",
                "focus:outline-none focus:ring-2 focus:ring-[oklch(0.70_0.15_190)] focus:ring-offset-2 focus:ring-offset-[var(--cinema-void)]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "shadow-lg hover:shadow-xl hover:shadow-white/10"
              )}
              whileHover={{ scale: isSigningIn ? 1 : 1.02, y: isSigningIn ? 0 : -2 }}
              whileTap={{ scale: 0.98 }}
            >
              {isSigningIn ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              <span className="text-base">
                {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
              </span>
            </motion.button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--cinema-silver)]/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 text-xs text-[var(--cinema-silver)]/30 bg-[var(--cinema-void)] uppercase tracking-widest">
                  or
                </span>
              </div>
            </div>

            {/* Continue without sign-in */}
            <motion.button
              onClick={handleContinueWithoutSignIn}
              className={cn(
                "w-full px-6 py-3.5 rounded-xl",
                "border border-[var(--cinema-silver)]/10 hover:border-[var(--cinema-silver)]/20",
                "text-[var(--cinema-silver)]/60 hover:text-[var(--cinema-silver)]/80",
                "text-sm font-light tracking-wide",
                "transition-all duration-300",
                "focus:outline-none focus:ring-2 focus:ring-[oklch(0.70_0.15_190_/_0.3)] focus:ring-offset-2 focus:ring-offset-[var(--cinema-void)]"
              )}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              Continue without signing in
            </motion.button>
          </motion.div>

          {/* Footer Section */}
          <motion.div
            className="pt-8 text-center space-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <p className="text-xs text-[var(--cinema-silver)]/30 leading-relaxed">
              By signing in, you agree to our{' '}
              <a href="#" className="text-[var(--cinema-silver)]/50 hover:text-[var(--cinema-silver)]/70 transition-colors underline underline-offset-2">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-[var(--cinema-silver)]/50 hover:text-[var(--cinema-silver)]/70 transition-colors underline underline-offset-2">
                Privacy Policy
              </a>
            </p>

            <p className="text-xs text-[var(--cinema-silver)]/20">
              Powered by Gemini AI
            </p>
          </motion.div>
        </div>

        {/* Mobile background hint */}
        <motion.div
          className="lg:hidden absolute bottom-8 left-0 right-0 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          <div className="flex items-center gap-2 text-[var(--cinema-silver)]/30 text-xs">
            <div className="w-8 h-0.5 bg-gradient-to-r from-transparent via-[var(--cinema-silver)]/20 to-transparent" />
            <span>AI-Powered Video Creation</span>
            <div className="w-8 h-0.5 bg-gradient-to-r from-transparent via-[var(--cinema-silver)]/20 to-transparent" />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
