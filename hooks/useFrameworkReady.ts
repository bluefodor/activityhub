import { useEffect } from 'react';

declare global {
  interface Window {
    frameworkReady?: () => void;
  }
}

export function useFrameworkReady() {
  useEffect(() => {
    try {
      // Add a small delay to ensure the framework is fully ready
      const timer = setTimeout(() => {
        if (typeof window !== 'undefined' && window.frameworkReady) {
          window.frameworkReady();
        }
      }, 50);
      
      return () => clearTimeout(timer);
    } catch (error) {
      console.warn('Framework ready hook error:', error);
    }
  }, []);
}
