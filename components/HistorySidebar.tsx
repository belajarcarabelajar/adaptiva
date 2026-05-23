import React, { memo } from 'react';
import { HistoryItem } from '../types';
import { Icons } from '../constants';

interface HistorySidebarProps {
  historyItems: HistoryItem[];
  selectedHistoryItemId: string | null;
  userLevel: number;
  darkMode: boolean;
  isVisible: boolean; 
  onToggleVisibilityMain: () => void; 
  onCloseMobile: () => void;        
  onSelectItem: (id: string) => void;
  onNewSession: () => void;
  onClearHistory: () => void;
  onToggleDarkMode: () => void;
  onDeleteItem: (id: string) => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = memo(({
  historyItems,
  selectedHistoryItemId,
  userLevel,
  darkMode,
  isVisible,
  onToggleVisibilityMain, 
  onCloseMobile,         
  onSelectItem,
  onNewSession,
  onClearHistory,
  onToggleDarkMode,
  onDeleteItem,
}) => {

  const handleItemSelect = (id: string) => {
    onSelectItem(id);
  };

  const handleNewSessionClick = () => {
    onNewSession();
  }

  return (
    <aside 
        className={`
            fixed inset-y-0 left-0 z-40 bg-brand-lightGray dark:bg-brand-black flex flex-col
            shadow-lg border-r border-brand-mediumGray dark:border-gray-700
            transition-all duration-300 ease-in-out
            md:relative md:h-screen md:sticky md:top-0 md:flex-shrink-0
            ${isVisible ? 'translate-x-0 w-64 p-4' : '-translate-x-full w-64 p-4 md:w-0 md:p-0 md:opacity-0 md:border-none md:overflow-hidden'}
        `}
        aria-label="History Sidebar"
        aria-hidden={!isVisible && typeof window !== 'undefined' && window.innerWidth >= 768}
    >
      <div className={`flex flex-col h-full ${(!isVisible && typeof window !== 'undefined' && window.innerWidth >= 768) ? 'invisible' : ''}`}>
        <div className="mb-4 flex justify-between items-start">
          <div className="flex-grow">
              <h2 className="text-xl font-semibold text-brand-blue dark:text-blue-300 mb-1 flex items-center">
              <Icons.ArchiveBoxIcon className="w-5 h-5 mr-2 text-brand-blue dark:text-blue-300" />
              Subject
              </h2>
              <div className="flex items-center">
              <Icons.StarIcon className="w-5 h-5 mr-1 text-brand-orange" /> 
              <span className="ml-1 font-semibold text-lg text-brand-black dark:text-gray-200">Level: {userLevel}</span>
              </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
                onClick={onToggleDarkMode}
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="p-1.5 rounded-full hover:bg-brand-mediumGray dark:hover:bg-gray-700 text-brand-blue dark:text-gray-300 transition-colors"
            >
                {darkMode ? <Icons.SunIcon className="w-5 h-5" /> : <Icons.MoonIcon className="w-5 h-5" />}
            </button>
            {/* Desktop-only close button inside the sidebar */}
            <button
                onClick={onCloseMobile} // This prop effectively sets isSidebarVisible to false
                className="p-1.5 rounded-full hover:bg-brand-mediumGray dark:hover:bg-gray-700 text-brand-blue dark:text-blue-300 transition-colors hidden md:block" // hidden by default, block on md+
                title="Close Sidebar"
                aria-label="Close Sidebar"
            >
                <Icons.XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <button
          onClick={handleNewSessionClick}
          className="w-full flex items-center justify-center mb-3 px-4 py-2 bg-brand-blue hover:bg-[#004175] dark:hover:bg-blue-700 text-brand-white font-semibold rounded-lg text-sm transition-colors"
        >
          <Icons.PlusCircleIcon className="w-5 h-5 mr-2" />
          New Learning Session
        </button>
        
        {historyItems.length > 0 && (
          <button
            onClick={onClearHistory}
            className="w-full flex items-center justify-center mb-4 px-4 py-2 bg-brand-red hover:bg-[#A30C0E] dark:hover:bg-red-700 text-brand-white font-semibold rounded-lg text-sm transition-colors"
          >
            <Icons.TrashIcon className="w-5 h-5 mr-2" />
            Clear All History
          </button>
        )}

        <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-brand-mediumGray dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {historyItems.length === 0 && (
            <p className="text-brand-black/70 dark:text-gray-400 text-sm italic">No history yet. Start a new session!</p>
          )}
          {historyItems.sort((a,b) => b.timestamp - a.timestamp).map((item) => (
            <div key={item.id} className="relative group">
              <button
                onClick={() => handleItemSelect(item.id)}
                className={`w-full text-left p-3 pr-8 rounded-md transition-colors text-sm break-words
                  ${selectedHistoryItemId === item.id 
                    ? 'bg-brand-blue text-brand-white shadow-md' 
                    : 'bg-brand-white dark:bg-gray-700 hover:bg-brand-mediumGray dark:hover:bg-gray-600 text-brand-black dark:text-gray-200 border border-brand-mediumGray dark:border-gray-600'}
                `}
                aria-current={selectedHistoryItemId === item.id ? "page" : undefined}
              >
                <div className="font-medium truncate">{item.topic}</div>
                <div className={`text-xs ${selectedHistoryItemId === item.id ? 'opacity-80' : 'text-brand-black/60 dark:text-gray-400'}`}>
                  {item.targetLanguage ? `${item.targetLanguage} - ` : ''}
                  {new Date(item.timestamp).toLocaleString()}
                </div>
                {typeof item.overallProgress === 'number' && (
                    <div className="mt-1">
                        <div className="w-full bg-brand-mediumGray dark:bg-gray-600/50 rounded-full h-1.5">
                            <div 
                                className="bg-brand-green h-1.5 rounded-full transition-all duration-500" 
                                style={{ width: `${Math.min(100, Math.max(0,item.overallProgress))}%`}}
                            ></div>
                        </div>
                        <span className={`text-xs ${selectedHistoryItemId === item.id ? 'opacity-70' : 'text-brand-black/50 dark:text-gray-500'}`}>{Math.round(item.overallProgress)}% complete</span>
                    </div>
                )}
              </button>
              <button
                  onClick={(e) => {
                      e.stopPropagation(); 
                      onDeleteItem(item.id);
                  }}
                  title="Delete this session"
                  aria-label={`Delete session for ${item.topic}`}
                  className={`absolute top-1 right-1 p-1.5 rounded-full transition-colors opacity-60 group-hover:opacity-100
                  ${selectedHistoryItemId === item.id 
                      ? 'bg-brand-blue/50 hover:bg-brand-red text-brand-white' 
                      : 'bg-brand-white/50 dark:bg-gray-700/50 hover:bg-brand-red/80 dark:hover:bg-red-600 text-brand-red dark:text-red-400 hover:text-brand-white'}`}
              >
                  <Icons.XMarkIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <footer className="hidden md:block text-center text-xs text-brand-black/60 dark:text-gray-400 mt-auto pt-4"> 
            Adaptiva Study by BCB Academy &copy; {new Date().getFullYear()}.
        </footer>
      </div>
    </aside>
  );
});

export default HistorySidebar;