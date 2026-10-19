import React from 'react';
import { Mic2 } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <header className="bg-white/95 border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          
          {/* Logo & Clean Title — shorter on mobile for readability */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white shrink-0">
              <Mic2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                  <span className="sm:hidden">ระบบติดตามคุณภาพอากาศและเสียง</span>
                  <span className="hidden sm:inline">ระบบติดตามคุณภาพอากาศและเสียง</span>
                </h1>
              </div>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
};
