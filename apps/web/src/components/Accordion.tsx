
import React, { useState, memo } from 'react';

interface AccordionProps {
  title: string | React.ReactNode; 
  children: React.ReactNode;
  startOpen?: boolean;
}

const Accordion: React.FC<AccordionProps> = memo(({ title, children, startOpen = false }) => {
  const [isOpen, setIsOpen] = useState(startOpen);

  return (
    <div className="border border-brand-mediumGray dark:border-gray-700 rounded-lg mb-3 bg-brand-white dark:bg-brand-black shadow-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-between items-center w-full p-4 text-left text-brand-blue dark:text-blue-400 hover:bg-brand-lightGray dark:hover:bg-gray-700 focus:outline-none transition-colors duration-200"
        aria-expanded={isOpen}
      >
        {typeof title === 'string' ? <span className="font-semibold text-lg text-brand-blue dark:text-blue-300">{title}</span> : title}
        <span className="text-brand-blue dark:text-blue-400 transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          {isOpen ? '−' : '+'}
        </span>
      </button>
      {isOpen && (
        <div className="p-4 border-t border-brand-mediumGray dark:border-gray-700 text-brand-black dark:text-gray-200">
          {children}
        </div>
      )}
    </div>
  );
});

export default Accordion;
