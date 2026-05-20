import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, Loader2, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { rawStoriesApiUrl, setRawStoriesSession } from '../api/rawStoriesBackend';

interface FormData {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  firebase?: string;
}

function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    return newErrors;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name as keyof FormErrors] || errors.firebase) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined,
        firebase: undefined
      }));
    }
  };

  const showToastMessage = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToastMessage(Object.values(validationErrors)[0], 'error');
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const response = await fetch(rawStoriesApiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.token) {
        throw new Error(data?.message || 'Invalid credentials. Please try again.');
      }

      setRawStoriesSession(data.token);
      showToastMessage('Login successful!');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login failed:', error);
      const errorMessage = error.message || 'An error occurred during login';
      setErrors({ firebase: errorMessage });
      showToastMessage(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    console.log('Forgot Password button clicked, navigating to /forgot-password');
    navigate('/forgot-password');
  };

  const handleSignupClick = () => {
    console.log('Sign Up button clicked, navigating to /signup');
    navigate('/signup');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-900">
      {/* Animated Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary-600/20 mix-blend-screen filter blur-[100px] animate-blob" />
        <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-secondary-600/20 mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[60%] rounded-full bg-blue-600/20 mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-dark rounded-3xl p-8 sm:p-10 text-white">
          {/* Logo & Header */}
          <div className="text-center mb-10">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 shadow-lg shadow-primary-500/30 transform rotate-3 overflow-hidden bg-white/5"
            >
              <img src="/images/rawstories-logo.svg" alt="RawStoriesbyrakesh logo" className="w-full h-full object-cover -rotate-3" />
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl font-bold mb-3 tracking-tight"
            >
              RawStoriesbyrakesh
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-slate-400 text-lg"
            >
              Gallery admin portal
            </motion.p>
          </div>

          {/* Firebase Error */}
          <AnimatePresence>
            {errors.firebase && (
              <motion.div 
                initial={{ opacity: 0, height: 0, mb: 0 }}
                animate={{ opacity: 1, height: 'auto', mb: 24 }}
                exit={{ opacity: 0, height: 0, mb: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 flex items-start">
                  <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-medium">{errors.firebase}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-primary-400">
                  <User className="h-5 w-5 text-slate-500 group-focus-within:text-primary-400 transition-colors" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`block w-full pl-11 pr-4 py-3.5 bg-slate-800/50 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 focus:bg-slate-800/80 transition-all duration-300 ${
                    errors.email ? 'border-red-500/50 ring-1 ring-red-500/50' : 'border-slate-700/50'
                  }`}
                  placeholder="Enter your email"
                />
              </div>
              {errors.email && (
                <p className="mt-2 text-sm text-red-400">{errors.email}</p>
              )}
            </motion.div>

            {/* Password Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-primary-400 hover:text-primary-300 text-sm font-medium transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-primary-400 transition-colors" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`block w-full pl-11 pr-12 py-3.5 bg-slate-800/50 border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 focus:bg-slate-800/80 transition-all duration-300 ${
                    errors.password ? 'border-red-500/50 ring-1 ring-red-500/50' : 'border-slate-700/50'
                  }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-primary-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-2 text-sm text-red-400">{errors.password}</p>
              )}
            </motion.div>

            {/* Login Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="pt-2"
            >
              <button
                type="submit"
                disabled={Object.keys(validateForm()).length > 0 || isLoading}
                className={`w-full py-3.5 px-4 rounded-xl font-medium text-white transition-all duration-300 flex items-center justify-center group relative overflow-hidden ${
                  Object.keys(validateForm()).length === 0 && !isLoading
                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 shadow-lg shadow-primary-500/25'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                <span className="relative flex items-center">
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                      Authenticating...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </span>
              </button>
            </motion.div>
          </form>
        </div>
      </motion.div>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-xl shadow-2xl z-50 min-w-[300px]"
          >
            <div className={`absolute inset-0 rounded-xl opacity-90 backdrop-blur-md ${
              toastType === 'success' ? 'bg-primary-600' : 'bg-red-600'
            }`} />
            <div className="relative flex items-center text-white">
              <div className={`p-1.5 rounded-full mr-3 ${
                toastType === 'success' ? 'bg-white/20' : 'bg-white/20'
              }`}>
                {toastType === 'success' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
              </div>
              <p className="font-medium text-sm">{toastMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Login;